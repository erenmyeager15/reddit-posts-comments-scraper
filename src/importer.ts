import { InputError, inputObject, normalizeInput } from './input.js';
import { boundedText, MAX_ROWS, parseCsv } from './csv.js';
import { matchingTerms, normalizeHeader, parseUtc, redactText, researchSignals } from './routes.js';
import type { ImportPlan, Observation, ResearchRecord } from './types.js';

type Row = Record<string, unknown>;
const ALIASES: Record<string, string> = {
    recordtype: 'recordType', datatype: 'recordType', postid: 'postId', commentid: 'commentId', id: 'id',
    subreddit: 'subreddit', subredditname: 'subreddit', communityname: 'subreddit',
    title: 'title', bodytext: 'bodyText', body: 'bodyText', selftext: 'bodyText',
    createdat: 'createdAt', posteddate: 'createdAt', observedat: 'observedAt', scrapedat: 'observedAt',
    score: 'score', upvotes: 'reportedUpvotes', totalcomments: 'declaredCommentCount', numberofcomments: 'declaredCommentCount',
    declaredcommentcount: 'declaredCommentCount', parentcommentid: 'parentCommentId', parentid: 'parentId',
    isnsfw: 'isNSFW', over18: 'isNSFW', contentstate: 'contentState',
};
const missing = (value: unknown): boolean => value === undefined || value === null || value === '';
function fail(message: string): never { throw new InputError(message, 'INVALID_IMPORT'); }
function canonical(raw: unknown, dropped: Set<string>): Row {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Every observation must be a flat object.');
    const entries = Object.entries(raw); if (entries.length > 40) fail('An observation exceeds 40 columns.');
    const value: Row = Object.create(null) as Row;
    for (const [key, item] of entries) {
        const name = normalizeHeader(key), field = Object.hasOwn(ALIASES, name) ? ALIASES[name] : undefined;
        if (!field) { dropped.add(name); continue; }
        if (Object.hasOwn(value, field)) fail('Multiple columns map to the same field.');
        value[field] = item;
    }
    return value;
}
function identifier(value: unknown, prefix: 't1' | 't3'): string {
    if (typeof value !== 'string') fail('Record IDs must be strings, not numbers.');
    const clean = value.trim().replace(new RegExp(`^${prefix}_`), '');
    if (!/^[a-z0-9]{1,20}$/.test(clean)) fail('IDs must be lowercase base36 identifiers (optional matching t1_/t3_ prefix).');
    return clean;
}
function text(value: unknown, max: number): string | null {
    if (missing(value)) return null;
    if (typeof value !== 'string' || value.length > max) fail(`Text fields must be strings of at most ${max} characters.`);
    return redactText(value) || null;
}
function bool(value: unknown): boolean | null {
    if (missing(value)) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
    return fail('isNSFW must be true, false or empty.');
}
function integer(value: unknown, nonnegative = false): number | null {
    if (missing(value)) return null;
    if (typeof value === 'string' && !/^-?\d+$/.test(value)) fail('Metrics must be unambiguous integers, not formulae/ranges/shorthand.');
    if (typeof value !== 'string' && typeof value !== 'number') fail('Metrics must be numbers or integer strings.');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || Math.abs(number) > 1_000_000_000 || (nonnegative && number < 0)) fail('Metric is outside its supported integer range.');
    return number;
}
function observation(raw: unknown, dropped: Set<string>, now: Date): Observation {
    const row = canonical(raw, dropped), type = row.recordType;
    if (type !== 'post' && type !== 'comment') fail('recordType must be post or comment; nested Reddit listings are not accepted.');
    if (!missing(row.id) && !missing(type === 'post' ? row.postId : row.commentId)) fail('Use either id or the type-specific ID, not both.');
    const postId = identifier(type === 'post' ? (row.postId ?? row.id) : row.postId, 't3');
    const commentId = type === 'comment' ? identifier(row.commentId ?? row.id, 't1') : null;
    if (type === 'post' && !missing(row.commentId)) fail('Post observations cannot contain commentId.');
    let subreddit: string | null = null;
    if (!missing(row.subreddit)) {
        if (typeof row.subreddit !== 'string') fail('subreddit must be a name, not an object or URL.');
        subreddit = row.subreddit.trim().replace(/^\/?r\//i, '');
        if (!/^[A-Za-z0-9_]{3,21}$/.test(subreddit)) fail('subreddit must contain 3–21 letters, digits or underscores.');
        subreddit = subreddit.toLowerCase();
    }
    const state = row.contentState ?? 'active';
    if (!['active', 'deleted', 'removed'].includes(String(state))) fail('contentState must be active, deleted or removed.');
    const marker = [row.bodyText, row.title].find(value => typeof value === 'string' && /^\[(deleted|removed)\]$/i.test(value.trim()));
    const contentState = marker ? (String(marker).toLowerCase().includes('deleted') ? 'deleted' : 'removed') : state as Observation['contentState'];
    // Never retain removed/deleted text, even when it is present beside a tombstone.
    const title = contentState === 'active' ? text(row.title, 1000) : null;
    const bodyText = contentState === 'active' ? text(row.bodyText, 20_000) : null;
    if (contentState === 'active' && (type === 'post' ? !title : !bodyText)) fail('Active posts need a title; active comments need bodyText.');
    const createdAt = parseUtc(row.createdAt, 'createdAt', now), observedAt = parseUtc(row.observedAt, 'observedAt', now);
    if (createdAt > observedAt) fail('createdAt cannot be later than observedAt.');
    if (!missing(row.score) && !missing(row.reportedUpvotes)) fail('score and upvotes are different metrics; supply only one.');
    const score = integer(row.score ?? row.reportedUpvotes), scoreBasis = score === null ? null : !missing(row.score) ? 'reported-score' : 'reported-upvotes';
    if (type === 'comment' && !missing(row.declaredCommentCount)) fail('declaredCommentCount belongs to posts, not comments.');
    const declaredCommentCount = type === 'post' ? integer(row.declaredCommentCount, true) : null;
    if (Object.hasOwn(row, 'parentCommentId') && Object.hasOwn(row, 'parentId')) fail('Use parentCommentId or parentId, not both.');
    let parentCommentId: string | null = null;
    const parentKnown = type === 'post' || Object.hasOwn(row, 'parentCommentId') || Object.hasOwn(row, 'parentId');
    if (!missing(row.parentCommentId)) parentCommentId = identifier(row.parentCommentId, 't1');
    if (!missing(row.parentId)) {
        if (typeof row.parentId !== 'string' || !/^t[13]_/.test(row.parentId)) fail('parentId must be a t1_comment or matching t3_post fullname.');
        if (row.parentId.startsWith('t3_')) { if (identifier(row.parentId, 't3') !== postId) fail('Root parentId does not match postId.'); }
        else parentCommentId = identifier(row.parentId, 't1');
    }
    if (type === 'post' && parentCommentId) fail('Posts cannot have a comment parent.');
    return { recordKey: `${type === 'post' ? 't3' : 't1'}_${type === 'post' ? postId : commentId}`, recordType: type, postId, commentId,
        subreddit, title, bodyText, createdAt, observedAt, score, scoreBasis, declaredCommentCount, parentCommentId, parentKnown,
        isNSFW: bool(row.isNSFW), contentState };
}
export function prepareImport(raw: unknown, now = new Date()): ImportPlan {
    const object = inputObject(raw), input = normalizeInput(raw);
    if (input.mode !== 'import' || object.authorizedData !== true) throw new InputError('Import requires explicit confirmation that this export and its derived analysis are licensed for this paid service. Confirmation is not a license or permission check.', 'SOURCE_RIGHTS_REQUIRED');
    const dataProvider = text(object.importSource, 160);
    if (!dataProvider) throw new InputError('Name your authorized export provider in importSource.');
    for (const key of ['importJson', 'importCsv']) if (Object.hasOwn(object, key) && typeof object[key] !== 'string') {
        throw new InputError('Import payload fields must be strings; omit the unused field or leave it empty.');
    }
    const json = typeof object.importJson === 'string' && object.importJson.trim() !== '', csv = typeof object.importCsv === 'string' && object.importCsv.trim() !== '';
    if (json === csv) throw new InputError('Provide exactly one importJson array-as-text or importCsv text.');
    let rows: unknown;
    if (csv) rows = parseCsv(object.importCsv);
    else { try { rows = JSON.parse(boundedText(object.importJson)); } catch (error) { if (error instanceof InputError) throw error; fail('importJson is not valid JSON.'); } }
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) fail('Import must contain 1–1,000 flat observations.');
    const dropped = new Set<string>(), groups = new Map<string, Observation[]>(), seen = new Map<string, string>();
    let duplicates = 0;
    for (const row of rows) {
        const item = observation(row, dropped, now), key = `${item.recordKey}/${item.observedAt}`, value = JSON.stringify(item);
        if (seen.has(key)) { if (seen.get(key) !== value) fail('Conflicting snapshots for the same ID and observedAt.'); duplicates++; continue; }
        seen.set(key, value); const group = groups.get(item.recordKey) ?? [];
        if (group.length && (group[0].postId !== item.postId || group[0].createdAt !== item.createdAt)) fail('The same record ID changes its thread or creation timestamp.');
        group.push(item); groups.set(item.recordKey, group);
    }
    if (groups.size > 500) fail('Import exceeds 500 unique post/comment records.');
    for (const group of groups.values()) group.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const latest = new Map([...groups].map(([key, values]) => [key, values.at(-1)!]));
    const removed = new Set(input.removedRecordKeys);
    for (const [key, item] of latest) if (item.contentState !== 'active') removed.add(key);
    let deleted = 0, nsfw = 0, removedThreads = 0;
    const records: ResearchRecord[] = [];
    for (const [key, observations] of groups) {
        const item = latest.get(key)!;
        if (removed.has(key)) { deleted++; continue; }
        if (item.recordType === 'comment' && removed.has(`t3_${item.postId}`)) { removedThreads++; continue; }
        const root = latest.get(`t3_${item.postId}`);
        const explicitSafe = item.isNSFW === false || (item.isNSFW === null && root?.isNSFW === false);
        if (input.skipNSFW && (!explicitSafe || observations.some(obs => obs.isNSFW === true)
            || (root && groups.get(root.recordKey)!.some(obs => obs.isNSFW === true)))) { nsfw++; continue; }
        const { contentState: _state, ...fields } = item;
        const body = `${item.title ?? ''}\n${item.bodyText ?? ''}`;
        records.push({ ...fields, observations: observations.filter(obs => obs.contentState === 'active'), signals: researchSignals(item.title, item.bodyText),
            mentions: matchingTerms(body, input.watchTerms), source: 'authorized-export', isSynthetic: false, dataProvider, importedAt: now.toISOString(),
            sourceRightsVerified: false, liveSourceVerified: false, authorFieldsIncluded: false });
    }
    return { records: records.slice(0, input.maxRecords), allEligibleKeys: records.map(item => item.recordKey), inputRows: rows.length,
        normalizedObservations: seen.size, duplicateObservations: duplicates, excludedDeletedRecords: deleted, excludedNSFWRecords: nsfw,
        excludedRemovedThreadRecords: removedThreads, eligibleRecords: records.length, omittedRecords: Math.max(0, records.length - input.maxRecords),
        unsupportedColumnsDropped: dropped.size, dataProvider };
}

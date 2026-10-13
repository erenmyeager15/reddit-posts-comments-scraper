import { csvRows, round } from './routes.js';
import type { ResearchInput, ResearchRecord } from './types.js';

const DAY = 86_400_000;
export function buildResearchReport(records: ResearchRecord[], input: ResearchInput, eligibleKeys = records.map(item => item.recordKey)) {
    const byKey = new Map(records.map(item => [item.recordKey, item])), eligible = new Set(eligibleKeys);
    const ancestry = new Map<string, { depth: number | null; issue: string | null }>();
    function trace(start: ResearchRecord): { depth: number | null; issue: string | null } {
        if (ancestry.has(start.recordKey)) return ancestry.get(start.recordKey)!;
        const chain: ResearchRecord[] = [], seen = new Set<string>(); let current = start;
        let result: { depth: number | null; issue: string | null };
        while (true) {
            if (seen.has(current.recordKey)) { result = { depth: null, issue: 'cycle-in-supplied-parents' }; break; }
            if (ancestry.has(current.recordKey)) { result = ancestry.get(current.recordKey)!; break; }
            seen.add(current.recordKey); chain.push(current);
            if (!current.parentKnown) { result = { depth: null, issue: 'parent-not-specified' }; break; }
            if (!current.parentCommentId) { result = { depth: -1, issue: null }; break; }
            const key = `t1_${current.parentCommentId}`, parent = byKey.get(key);
            if (!parent) { result = { depth: null, issue: eligible.has(key) ? 'parent-not-in-saved-selection' : 'parent-not-in-eligible-export' }; break; }
            if (parent.postId !== current.postId) { result = { depth: null, issue: 'parent-belongs-to-different-thread' }; break; }
            current = parent;
        }
        for (const item of chain.reverse()) {
            result = { depth: result.depth === null ? null : result.depth + 1, issue: result.issue };
            ancestry.set(item.recordKey, result);
        }
        return ancestry.get(start.recordKey)!;
    }
    const quality: { recordKey: string; issue: string }[] = [];
    const insights = records.map(item => {
        const relationship = item.recordType === 'comment' ? trace(item) : { depth: null, issue: null };
        const issues: string[] = [];
        if (!item.subreddit) issues.push('subreddit-not-supplied');
        if (item.isNSFW === null) issues.push('nsfw-flag-not-supplied-on-record');
        if (!item.scoreBasis) issues.push('score-not-supplied');
        if (relationship.issue) issues.push(relationship.issue);
        if (item.recordType === 'comment' && !byKey.has(`t3_${item.postId}`)) issues.push(eligible.has(`t3_${item.postId}`) ? 'post-not-in-saved-selection' : 'post-not-in-eligible-export');
        for (const issue of issues) quality.push({ recordKey: item.recordKey, issue });
        return { recordKey: item.recordKey, recordType: item.recordType, postId: item.postId, subreddit: item.subreddit,
            createdAt: item.createdAt, observedAt: item.observedAt, score: item.score, scoreBasis: item.scoreBasis,
            suppliedParentDepth: relationship.depth, signals: item.signals, mentions: item.mentions,
            reviewExcerpt: `${item.title ?? ''} ${item.bodyText ?? ''}`.trim().slice(0, 120),
            issueCount: issues.length, source: item.source, isSynthetic: item.isSynthetic };
    });
    const grouped = new Map<string, ResearchRecord[]>();
    for (const item of records) { const group = grouped.get(item.postId) ?? []; group.push(item); grouped.set(item.postId, group); }
    const threads = [...grouped].map(([postId, group]) => {
        const post = byKey.get(`t3_${postId}`), comments = group.filter(item => item.recordType === 'comment');
        const matched = post ? comments.filter(item => item.observations.some(obs => obs.observedAt === post.observedAt)).length : 0;
        const declared = post?.declaredCommentCount ?? null;
        const metricAvailable = Boolean(post) && declared !== null && declared > 0 && matched <= declared;
        const issue = !post ? 'root-post-not-saved' : declared === null ? 'declared-comment-count-unknown'
            : matched > declared ? 'supplied-count-exceeds-declared-count' : comments.length !== matched ? 'comment-observation-times-differ' : null;
        if (issue) quality.push({ recordKey: `t3_${postId}`, issue });
        return { postId, rootPostSupplied: Boolean(post), selectedCommentRecords: comments.length,
            declaredCommentsAtRootSnapshot: declared, commentsPresentAtRootSnapshot: matched,
            observedToDeclaredCountRatioPercent: metricAvailable ? round(matched / declared! * 100) : null,
            questionWithoutSuppliedCommentRecords: Boolean(post?.signals.includes('question')) && comments.length === 0,
            issue, scope: 'Counts from saved supplied records, not proof of a complete or currently unanswered Reddit thread.',
            source: group[0].source, isSynthetic: group[0].isSynthetic };
    });
    const changes = records.map(item => {
        const latest = item.observations.at(-1)!, earlier = item.observations.slice(0, -1)
            .filter(obs => Date.parse(latest.observedAt) - Date.parse(obs.observedAt) <= input.comparisonWindowDays * DAY)[0];
        const comparable = Boolean(earlier?.scoreBasis && earlier.scoreBasis === latest.scoreBasis && earlier.score !== null && latest.score !== null);
        const fromComments = earlier?.declaredCommentCount ?? null, toComments = latest.declaredCommentCount;
        return { recordKey: item.recordKey, from: earlier?.observedAt ?? null, to: latest.observedAt,
            comparisonAvailable: Boolean(earlier), scoreDelta: comparable ? latest.score! - earlier!.score! : null,
            scoreBasis: comparable ? latest.scoreBasis : null,
            declaredCommentCountDelta: earlier && fromComments !== null && toComments !== null ? toComments - fromComments : null,
            suppliedTextChanged: earlier ? earlier.title !== latest.title || earlier.bodyText !== latest.bodyText : null,
            limitation: 'Supplied snapshot differences only. Scores may be fuzzed; changes do not establish growth, sentiment or causation.',
            source: item.source, isSynthetic: item.isSynthetic };
    });
    const signals = [...new Set(insights.flatMap(item => item.signals))].sort().map(signal => ({ signal,
        mentionedRecords: records.filter(item => item.signals.includes(signal)).length,
        scope: 'Rule-based textual cue for manual review; not validated intent or sentiment.' }));
    const mentions = input.watchTerms.map(term => {
        const matched = records.filter(item => item.mentions.includes(term));
        return { term, mentionedRecords: matched.length, selectedRecords: records.length,
            sampleMentionSharePercent: records.length ? round(matched.length / records.length * 100) : null,
            postMentions: matched.filter(item => item.recordType === 'post').length,
            commentMentions: matched.filter(item => item.recordType === 'comment').length,
            scope: 'Literal mentions in this supplied selection; not market share or unique people.' };
    });
    const days = new Map<string, number>();
    for (const item of records) { const date = item.createdAt.slice(0, 10); days.set(date, (days.get(date) ?? 0) + 1); }
    return { source: records[0]?.source ?? (input.mode === 'demo' ? 'synthetic-demo' : 'authorized-export'),
        isSynthetic: input.mode === 'demo', recordsAnalyzed: records.length, postsAnalyzed: records.filter(item => item.recordType === 'post').length,
        commentsAnalyzed: records.filter(item => item.recordType === 'comment').length,
        observationsAnalyzed: records.reduce((sum, item) => sum + item.observations.length, 0), insights, signals, mentions, threads, changes, quality,
        createdDateCountsUTC: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, records]) => ({ date, records })),
        method: 'Transparent literal phrase rules and supplied parent/snapshot evidence; no AI, external requests, country inference or author profiling.',
        completeness: 'Selected supplied records only. Deleted, excluded, capped, unsaved and unavailable material is not reconstructed.',
        liveSourceVerified: false, sourceRightsVerified: false, authorFieldsIncluded: false, persistentHistoryWritten: false };
}
export type ResearchReport = ReturnType<typeof buildResearchReport>;
export function insightsCsv(report: ResearchReport): string {
    return csvRows(['recordKey', 'recordType', 'postId', 'subreddit', 'createdAt', 'observedAt', 'score', 'scoreBasis', 'suppliedParentDepth', 'signals', 'mentions', 'reviewExcerpt', 'issueCount', 'source', 'isSynthetic'],
        report.insights.map(item => [item.recordKey, item.recordType, item.postId, item.subreddit, item.createdAt, item.observedAt, item.score,
            item.scoreBasis, item.suppliedParentDepth, item.signals.join('; '), item.mentions.join('; '), item.reviewExcerpt, item.issueCount, item.source, item.isSynthetic]));
}
export const threadsCsv = (report: ResearchReport): string => csvRows(['postId', 'rootPostSupplied', 'selectedCommentRecords', 'declaredCommentsAtRootSnapshot', 'commentsPresentAtRootSnapshot', 'observedToDeclaredCountRatioPercent', 'questionWithoutSuppliedCommentRecords', 'issue', 'scope', 'source', 'isSynthetic'],
    report.threads.map(item => [item.postId, item.rootPostSupplied, item.selectedCommentRecords, item.declaredCommentsAtRootSnapshot,
        item.commentsPresentAtRootSnapshot, item.observedToDeclaredCountRatioPercent, item.questionWithoutSuppliedCommentRecords, item.issue, item.scope, item.source, item.isSynthetic]));
export const mentionsCsv = (report: ResearchReport): string => csvRows(['term', 'mentionedRecords', 'selectedRecords', 'sampleMentionSharePercent', 'postMentions', 'commentMentions', 'scope', 'source', 'isSynthetic'],
    report.mentions.map(item => [item.term, item.mentionedRecords, item.selectedRecords, item.sampleMentionSharePercent, item.postMentions,
        item.commentMentions, item.scope, report.source, report.isSynthetic]));
export const changesCsv = (report: ResearchReport): string => csvRows(['recordKey', 'from', 'to', 'comparisonAvailable', 'scoreDelta', 'scoreBasis', 'declaredCommentCountDelta', 'suppliedTextChanged', 'limitation', 'source', 'isSynthetic'],
    report.changes.map(item => [item.recordKey, item.from, item.to, item.comparisonAvailable, item.scoreDelta, item.scoreBasis,
        item.declaredCommentCountDelta, item.suppliedTextChanged, item.limitation, item.source, item.isSynthetic]));
export const qualityCsv = (report: ResearchReport): string => csvRows(['recordKey', 'issue', 'source', 'isSynthetic'], report.quality.map(item => [item.recordKey, item.issue, report.source, report.isSynthetic]));
const safeMd = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_\[\]]/g, '\\$&');
export function researchMarkdown(report: ResearchReport): string {
    return `# ${report.isSynthetic ? 'SYNTHETIC DEMO — invented values' : 'Authorized export analysis'}\n\n`
        + `${report.recordsAnalyzed} selected records: ${report.postsAnalyzed} posts and ${report.commentsAnalyzed} comments. No live Reddit lookup.\n\n`
        + `## Textual review cues\n\n${report.signals.length ? report.signals.map(item => `- ${item.signal}: ${item.mentionedRecords} records`).join('\n') : 'No configured phrase cues found.'}\n\n`
        + `## Supplied selection mentions\n\n${report.mentions.length ? report.mentions.map(item => `- ${safeMd(item.term)}: ${item.mentionedRecords}/${item.selectedRecords} records`).join('\n') : 'No literal watch terms configured.'}\n\n`
        + `## Scope and quality\n\n${report.threads.length} supplied threads; ${report.quality.length} quality warnings.\n\n`
        + `${report.method}\n\n${report.completeness}\n\n`
        + 'Mention counts are not market share; phrases are not validated intent/sentiment; score changes may be fuzzed. US describes the workflow audience, not inferred user location. No author profiles, outreach, LLM training, monitoring schedule or cross-run history.\n';
}

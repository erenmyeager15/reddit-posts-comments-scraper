import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareImport } from './importer.js';
import { normalizeInput } from './input.js';
import { csvCell, matchingTerms, parseUtc, redactText } from './routes.js';
import { parseCsv } from './csv.js';
import { POST, COMMENT, NOW, importInput } from './test-fixtures.js';

test('imports unique posts/comments, keeps negative metrics and supplied snapshots', () => {
    const plan = prepareImport(importInput([POST, { ...POST, observedAt: '2026-10-11', score: 10 }, COMMENT]), NOW);
    assert.equal(plan.records.length, 2); assert.equal(plan.records[0].observations.length, 2);
    assert.equal(plan.records[1].score, -2); assert.deepEqual(plan.records[0].mentions, ['AtlasApp']);
    assert(plan.records[0].signals.includes('pain-point-phrase')); assert(plan.records[0].signals.includes('feature-request-phrase'));
});
test('JSON/CSV normalized results match with quoted multiline fields', () => {
    const rows = [{ ...POST, bodyText: 'I wish we had "exports",\nplease add them.' }];
    const headers = Object.keys(rows[0]), csv = [headers.join(','), headers.map(key => csvCell(rows[0][key as keyof typeof POST])).join(',')].join('\r\n');
    const json = importInput(rows); const { importJson: _json, ...base } = json;
    assert.deepEqual(prepareImport({ ...base, importCsv: csv }, NOW), prepareImport(json, NOW));
});
test('unsupported identity columns are omitted and sensitive text is redacted', () => {
    const plan = prepareImport(importInput([{ ...POST, authorUsername: 'SENSITIVE_USER', password: 'SECRET_SENTINEL',
        bodyText: 'Contact test@example.com or +1 (555) 123-4567, u/alice. api_key=SECRET_KEY https://example.com/private' }]), NOW);
    const output = JSON.stringify(plan.records);
    for (const value of ['SENSITIVE_USER', 'SECRET_SENTINEL', 'test@example.com', '123-4567', 'u/alice', 'SECRET_KEY', 'https://']) assert(!output.includes(value));
    assert.equal(plan.unsupportedColumnsDropped, 2); assert.equal(plan.records[0].authorFieldsIncluded, false);
});
test('fullnames and common flat export aliases are accepted without URL fetching', () => {
    const plan = prepareImport(importInput([{ dataType: 'post', id: 't3_abc123', title: 'A supplied post', body: 'Text',
        communityName: 'r/synthetic_saas_lab', createdAt: '2026-10-10', scrapedAt: '2026-10-12', upVotes: '12', over18: 'false' }]), NOW);
    assert.equal(plan.records[0].postId, 'abc123'); assert.equal(plan.records[0].scoreBasis, 'reported-upvotes');
});
test('dedupe does not bill repeated identical observations; conflicts beyond cap still fail', () => {
    assert.equal(prepareImport(importInput([POST, POST]), NOW).duplicateObservations, 1);
    assert.throws(() => prepareImport(importInput([POST, COMMENT, { ...COMMENT, score: 5 }], { maxRecords: 1 }), NOW), /Conflicting/);
});
test('removed latest snapshot suppresses every earlier body and dependent comments', () => {
    const plan = prepareImport(importInput([{ ...POST, observedAt: '2026-10-11', bodyText: 'OLD_PRIVATE_TEXT' },
        { ...POST, contentState: 'deleted', bodyText: 'STILL_PRIVATE' }, COMMENT]), NOW);
    assert.equal(plan.records.length, 0); assert.equal(plan.excludedDeletedRecords, 1); assert.equal(plan.excludedRemovedThreadRecords, 1);
    assert(!JSON.stringify(plan).includes('PRIVATE'));
});
test('explicit tombstone keys suppress only selected supplied record IDs', () => {
    const plan = prepareImport(importInput([POST, COMMENT], { removedRecordKeys: ['t1_reply01'] }), NOW);
    assert.equal(plan.records.length, 1); assert.equal(plan.excludedDeletedRecords, 1);
});
test('NSFW skip is conservative: unknowns excluded, comments may inherit safe root', () => {
    const unknown = { ...POST, isNSFW: null };
    assert.equal(prepareImport(importInput([unknown]), NOW).excludedNSFWRecords, 1);
    const plan = prepareImport(importInput([POST, { ...COMMENT, isNSFW: null }]), NOW);
    assert.equal(plan.records.length, 2);
    assert.equal(prepareImport(importInput([{ ...POST, isNSFW: true }, COMMENT]), NOW).records.length, 0);
    assert.equal(prepareImport(importInput([unknown], { skipNSFW: false }), NOW).records.length, 1);
});
test('account deletion is not confused with post deletion', () => {
    const plan = prepareImport(importInput([{ ...POST, author: '[deleted]' }]), NOW);
    assert.equal(plan.records.length, 1); assert.equal(plan.unsupportedColumnsDropped, 1);
});
for (const [name, row] of Object.entries({
    numericId: { ...POST, postId: 123 }, wrongPrefix: { ...POST, postId: 't1_abc' }, pathId: { ...POST, postId: '../abc' },
    impossibleDate: { ...POST, observedAt: '2026-02-30' }, futureDate: { ...POST, observedAt: '2099-01-01' },
    nonUtc: { ...POST, observedAt: '2026-10-12T00:00:00+05:30' }, impossibleTime: { ...POST, observedAt: '2026-10-12T25:00:00Z' },
    creationAfterObservation: { ...POST, createdAt: '2026-10-13' }, missingTitle: { ...POST, title: '' },
    missingCommentBody: { ...COMMENT, bodyText: '' }, unknownType: { ...POST, recordType: 'profile' },
    metricFormula: { ...POST, score: '=1+2' }, metricFraction: { ...POST, score: 1.5 }, metricNaN: { ...POST, score: 'NaN' },
    metricShort: { ...POST, score: '12K' }, dualMetrics: { ...POST, upvotes: 20 }, negativeComments: { ...POST, declaredCommentCount: -1 },
    boolNumber: { ...POST, isNSFW: 1 }, subredditUrl: { ...POST, subreddit: 'https://reddit.com/r/test' },
    aliases: { ...POST, body: 'Same field twice' }, dualId: { ...POST, id: 'abc123' },
    mismatchedRoot: { ...COMMENT, parentCommentId: undefined, parentId: 't3_other' },
    parentAliases: { ...COMMENT, parentId: 't3_abc123' }, postCommentParent: { ...POST, parentCommentId: 'reply01' },
    commentCount: { ...COMMENT, declaredCommentCount: 3 }, unknownState: { ...POST, contentState: 'maybe' },
})) test(`rejects invalid row ${name}`, () => assert.throws(() => prepareImport(importInput([row]), NOW)));
for (const input of [null, [], {}, { mode: 'demo', keywords: [] }, { mode: 'live' }, { mode: 'demo', importJson: '[]' },
    { mode: 'import', authorizedData: false }, { mode: 'import', maxRecords: 0 }, { mode: 'import', maxRecords: 501 },
    { mode: 'demo', watchTerms: ['atlas', 'ATLAS'] }, { mode: 'demo', watchTerms: ['person@example.com'] },
    { mode: 'demo', removedRecordKeys: ['t1_abc'] }, { mode: 'demo', skipNSFW: 0 }, { mode: 'demo', demoPreset: 'fake' },
    { mode: 'demo', comparisonWindowDays: 0 }, { mode: 'demo', extraField: true }]) {
    test(`rejects invalid top-level input ${JSON.stringify(input)}`, () => assert.throws(() => normalizeInput(input)));
}
for (const [name, extra] of Object.entries({ missingRights: { authorizedData: false }, missingProvider: { importSource: '' },
    twoInputs: { importCsv: 'recordType\npost' }, objectJson: { importJson: '{}' }, malformedJson: { importJson: '[' },
    emptyJson: { importJson: '[]' }, oversized: { importJson: ' '.repeat(2 * 1024 * 1024 + 1) },
    tooManyRows: { importJson: JSON.stringify(Array.from({ length: 1001 }, () => POST)) } })) {
    test(`rejects malformed import ${name}`, () => assert.throws(() => prepareImport(importInput([POST], extra), NOW)));
}
for (const csv of ['a,a\n1,2', 'a\n"unclosed', 'a,b\n1', 'a\n"x"bad', 'a\nmis"placed', '\na\n', 'a\0\nb']) {
    test(`rejects malformed CSV ${JSON.stringify(csv)}`, () => assert.throws(() => parseCsv(csv)));
}
test('large bound: 500 unique records / 1,000 observations pass once per record', () => {
    const rows = Array.from({ length: 500 }, (_, i) => [{ ...POST, postId: i.toString(36), observedAt: '2026-10-11' },
        { ...POST, postId: i.toString(36), observedAt: '2026-10-12' }]).flat();
    const plan = prepareImport(importInput(rows, { maxRecords: 500 }), NOW);
    assert.equal(plan.records.length, 500); assert.equal(plan.normalizedObservations, 1000);
});
test('more than 500 unique IDs is rejected before selection', () => {
    assert.throws(() => prepareImport(importInput(Array.from({ length: 501 }, (_, i) => ({ ...POST, postId: i.toString(36) }))), NOW), /500 unique/);
});
test('same ID cannot change its thread or creation date', () => {
    assert.throws(() => prepareImport(importInput([COMMENT, { ...COMMENT, observedAt: '2026-10-11', postId: 'other1' }]), NOW));
    assert.throws(() => prepareImport(importInput([POST, { ...POST, observedAt: '2026-10-11', createdAt: '2026-10-09' }]), NOW));
});
test('literal term matches are bounded, case-insensitive and escaped', () => {
    assert.deepEqual(matchingTerms('atlasapp2 uses AtlasApp and c++', ['AtlasApp', 'c++', '.*']), ['AtlasApp', 'c++']);
    assert.deepEqual(matchingTerms('atlasapp2 atlasapp_name', ['AtlasApp']), []);
});
test('CSV output escapes formula-like text; date and privacy helpers are bounded', () => {
    for (const value of ['=cmd()', '+SUM(1)', '-1+2', '@cmd', '\t=cmd', ' \uFEFF=cmd']) assert(csvCell(value).startsWith('"\''));
    assert.equal(parseUtc('2024-02-29', 'date', NOW), '2024-02-29T00:00:00.000Z');
    assert.equal(redactText('ordinary text'), 'ordinary text');
});
test('demo input form inert defaults do not disguise imported data', () => {
    assert.equal(normalizeInput({ mode: 'demo', authorizedData: false, importJson: '', importCsv: ' ', importSource: '', removedRecordKeys: [] }).mode, 'demo');
    assert.throws(() => normalizeInput({ mode: 'demo', authorizedData: true }));
    assert.throws(() => normalizeInput({ mode: 'demo', importSource: 'Actual export' }));
});
test('unused empty input form payload does not conflict with a valid import', () => {
    assert.equal(prepareImport(importInput([POST], { importCsv: '' }), NOW).records.length, 1);
    assert.throws(() => prepareImport(importInput([POST], { importCsv: null }), NOW));
});
test('CSV span parser preserves dense escaped quotes, CRLF and empty quoted fields', () => {
    assert.deepEqual(parseCsv('a,b,c\r\n"""x""\r\ny","",tail\r\n'), [{ a: '"x"\r\ny', b: '', c: 'tail' }]);
    assert.deepEqual(parseCsv('a,b\n"a"  ,"b"\t\n'), [{ a: 'a', b: 'b' }]);
    assert.throws(() => parseCsv('a\n"tail without closing quote'));
});

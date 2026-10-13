import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareImport } from './importer.js';
import { normalizeInput } from './input.js';
import { buildResearchReport, changesCsv, insightsCsv, mentionsCsv, qualityCsv, researchMarkdown, threadsCsv } from './analysis.js';
import { demoRows } from './demo-presets.js';
import { NOW, POST, COMMENT, REPLY, importInput } from './test-fixtures.js';
const report = (rows: unknown[], extra: Record<string, unknown> = {}) => {
    const raw = importInput(rows, extra), plan = prepareImport(raw, NOW);
    return buildResearchReport(plan.records, normalizeInput(raw), plan.allEligibleKeys);
};
test('parent ancestry is derived from supplied relationships, not guessed zero', () => {
    const result = report([POST, COMMENT, REPLY]);
    assert.equal(result.insights[1].suppliedParentDepth, 0); assert.equal(result.insights[2].suppliedParentDepth, 1);
    assert.equal(result.threads[0].observedToDeclaredCountRatioPercent, 100);
    assert(result.threads[0].scope.includes('not proof'));
});
test('missing, capped, cross-thread and unknown parents have explicit quality warnings', () => {
    const missing = report([POST, { ...COMMENT, parentCommentId: 'nope' }]);
    assert(missing.quality.some(item => item.issue === 'parent-not-in-eligible-export'));
    const capped = report([POST, REPLY, COMMENT], { maxRecords: 2 });
    assert(capped.quality.some(item => item.issue === 'parent-not-in-saved-selection'));
    const cross = report([POST, { ...COMMENT, commentId: 'other', postId: 'otherp' }, { ...REPLY, parentCommentId: 'other' }]);
    assert(cross.quality.some(item => item.issue === 'parent-belongs-to-different-thread'));
    const { parentCommentId: _parent, ...unknown } = COMMENT;
    assert(report([unknown]).quality.some(item => item.issue === 'parent-not-specified'));
});
test('cycles and self-parent references are bounded and never get invented depths', () => {
    const result = report([POST, { ...COMMENT, parentCommentId: 'reply02' }, REPLY]);
    assert.equal(result.insights[1].suppliedParentDepth, null); assert.equal(result.insights[2].suppliedParentDepth, null);
    assert.equal(result.quality.filter(item => item.issue === 'cycle-in-supplied-parents').length, 2);
    assert(report([{ ...COMMENT, parentCommentId: 'reply01' }]).quality.some(item => item.issue === 'cycle-in-supplied-parents'));
});
test('coverage keeps zero, unknown, stale times and counts over declared unknown', () => {
    assert.equal(report([{ ...POST, declaredCommentCount: null }, COMMENT]).threads[0].observedToDeclaredCountRatioPercent, null);
    assert.equal(report([{ ...POST, declaredCommentCount: 0 }, COMMENT]).threads[0].observedToDeclaredCountRatioPercent, null);
    const stale = report([POST, { ...COMMENT, observedAt: '2026-10-11' }]);
    assert.equal(stale.threads[0].commentsPresentAtRootSnapshot, 0); assert.equal(stale.threads[0].issue, 'comment-observation-times-differ');
    assert.equal(report([COMMENT]).threads[0].rootPostSupplied, false);
});
test('sample-only question flag is never claimed to be a live unanswered thread', () => {
    const result = report([POST]); assert.equal(result.threads[0].questionWithoutSuppliedCommentRecords, true);
    assert(result.threads[0].scope.includes('currently unanswered')); assert.equal(result.liveSourceVerified, false);
});
test('literal mention share is per record, not per repetition, population or people', () => {
    const result = report([{ ...POST, bodyText: 'AtlasApp AtlasApp AtlasApp' }, COMMENT]);
    assert.equal(result.mentions[0].mentionedRecords, 2); assert.equal(result.mentions[0].sampleMentionSharePercent, 100);
    assert.equal(result.mentions[1].mentionedRecords, 1); assert.equal(result.mentions[1].sampleMentionSharePercent, 50);
    assert(result.mentions[0].scope.includes('not market share'));
});
test('snapshots compare within a bounded window and matching score basis', () => {
    const result = report([{ ...POST, observedAt: '2026-10-11', score: 10, declaredCommentCount: 1 }, POST]);
    assert.equal(result.changes[0].scoreDelta, 10); assert.equal(result.changes[0].declaredCommentCountDelta, 1);
    const mixed = report([{ ...POST, score: undefined, upvotes: 10, observedAt: '2026-10-11' }, POST]);
    assert.equal(mixed.changes[0].scoreDelta, null);
    const stale = report([{ ...POST, createdAt: '2026-08-01', observedAt: '2026-08-01' }, { ...POST, createdAt: '2026-08-01' }]);
    assert.equal(stale.changes[0].comparisonAvailable, false); assert(stale.changes[0].limitation.includes('fuzzed'));
});
test('the latest supplied content drives cues, not duplicated older snapshots', () => {
    const result = report([{ ...POST, bodyText: 'Please add NimbusApp support', observedAt: '2026-10-11' }, { ...POST, title: 'Ordinary update', bodyText: 'Works as expected.' }]);
    assert.equal(result.insights[0].signals.length, 0); assert.equal(result.mentions[1].mentionedRecords, 0);
    assert.equal(result.changes[0].suppliedTextChanged, true); assert.equal(result.createdDateCountsUTC[0].records, 1);
});
test('Markdown escapes user labels; CSVs share explicit provenance and guards', () => {
    const result = report([POST, COMMENT], { watchTerms: ['<script>', '=HYPERLINK'] });
    assert(!researchMarkdown(result).includes('<script>')); assert(researchMarkdown(result).includes('&lt;script&gt;'));
    for (const csv of [insightsCsv(result), mentionsCsv(result), threadsCsv(result), changesCsv(result), qualityCsv(result)]) {
        assert(csv.includes('"source"')); assert(csv.includes('"isSynthetic"'));
    }
    assert(mentionsCsv(result).includes('"\'=HYPERLINK"'));
});
test('all three invented demos have distinct meaningful research/quality outputs', () => {
    const results = ['us-saas-research', 'us-brand-comparison', 'us-thread-quality'].map(preset =>
        report(demoRows(preset as Parameters<typeof demoRows>[0])));
    assert(results[0].signals.some(item => item.signal === 'feature-request-phrase'));
    assert(results[1].mentions.every(item => item.mentionedRecords > 0));
    assert(results[2].quality.some(item => item.issue === 'cycle-in-supplied-parents'));
    assert(results[2].changes.some(item => item.scoreDelta === 10));
});

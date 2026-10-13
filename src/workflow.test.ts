import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryError, runWorkflow } from './workflow.js';
import type { ResearchRecord } from './types.js';
import { NOW, POST, COMMENT, importInput } from './test-fixtures.js';
function ports(max = Infinity, failSave = false, failWrite = '') {
    const rows: ResearchRecord[] = [], files = new Map<string, unknown>(); let saves = 0;
    return { rows, files, get saves() { return saves; },
        canSave: () => rows.length < max,
        save: async (record: ResearchRecord) => { saves++; if (failSave) throw new Error('Save failed after unknown remote state');
            rows.push(record); return { chargedCount: 1, eventChargeLimitReached: rows.length === max }; },
        write: async (key: string, value: unknown) => { if (key === failWrite) throw new Error('write failed'); files.set(key, value); },
        status: async () => undefined };
}
for (const preset of ['us-saas-research', 'us-brand-comparison', 'us-thread-quality']) {
    test(`demo ${preset} makes zero saves/charges and produces labeled artifacts`, async () => {
        const p = ports(), summary = await runWorkflow({ mode: 'demo', demoPreset: preset, watchTerms: ['AtlasApp', 'NimbusApp'] }, p, NOW);
        assert.equal(summary.savedRecords, 0); assert.equal(summary.outcome, 'demo_complete'); assert.equal(p.saves, 0);
        assert.equal(p.files.size, 8); assert.equal(summary.isSynthetic, true); assert(summary.previewRecords > 0);
        assert.deepEqual(summary.confirmedResultEventCounts, { 'post-scraped': 0, 'comment-scraped': 0 });
        assert(String(p.files.get('REPORT.md')).includes('SYNTHETIC DEMO'));
    });
}
test('full import has exact separate events and complete reports with no report dataset fee', async () => {
    const p = ports(), summary = await runWorkflow(importInput([POST, COMMENT]), p, NOW);
    assert.equal(p.rows.length, 2); assert.equal(summary.completeSelectedOutput, true); assert.equal(summary.reportsComplete, true);
    assert.deepEqual(summary.confirmedResultEventCounts, { 'post-scraped': 1, 'comment-scraped': 1 });
    assert.equal(p.files.size, 8); assert.equal(summary.upstreamRequestCount, 0); assert.equal(summary.persistentHistoryWritten, false);
});
test('zero remaining budget writes zero results and no fabricated complete reports', async () => {
    const p = ports(0), summary = await runWorkflow(importInput([POST, COMMENT]), p, NOW);
    assert.equal(p.saves, 0); assert.equal(summary.outcome, 'stopped_spending_limit'); assert.equal(summary.completeSelectedOutput, false);
    assert.equal(summary.unsavedSelectedRecords, 2);
});
test('partial cap reports only confirmed saved records, not the unsaved comment', async () => {
    const p = ports(1), summary = await runWorkflow(importInput([POST, COMMENT]), p, NOW);
    assert.equal(p.rows.length, 1); assert.equal(summary.completeSelectedOutput, false); assert.equal(summary.spendingLimitReached, true);
    assert.equal(summary.savedComments, 0); assert(!JSON.stringify(p.files.get('REPORT')).includes('t1_reply01'));
    assert(!String(p.files.get('INSIGHTS.csv')).includes('t1_reply01'));
});
test('exact final cap is a complete success, not a failed/partial run', async () => {
    const p = ports(2), summary = await runWorkflow(importInput([POST, COMMENT]), p, NOW);
    assert.equal(summary.outcome, 'succeeded'); assert.equal(summary.completeSelectedOutput, true); assert.equal(summary.unsavedSelectedRecords, 0);
    assert.equal(summary.spendingLimitReached, true);
});
test('uncertain save does not retry and warns that a row/event may have persisted', async () => {
    const p = ports(Infinity, true);
    await assert.rejects(runWorkflow(importInput([POST, COMMENT]), p, NOW), DeliveryError);
    assert.equal(p.saves, 1); const status = p.files.get('RUN_STATUS') as { unconfirmedDeliveryAttempt: boolean; unconfirmedDeliveryNotice: string; reportsComplete: boolean };
    assert.equal(status.unconfirmedDeliveryAttempt, true); assert(status.unconfirmedDeliveryNotice.includes('already')); assert.equal(status.reportsComplete, false);
});
for (const key of ['REPORT', 'INSIGHTS.csv', 'THREADS.csv', 'MENTIONS.csv', 'CHANGES.csv', 'QUALITY.csv', 'REPORT.md', 'RUN_STATUS']) {
    test(`report failure at ${key} is not a false success or extra save`, async () => {
        const p = ports(Infinity, false, key); await assert.rejects(runWorkflow(importInput([POST]), p, NOW), DeliveryError); assert.equal(p.saves, 1);
    });
}
test('invalid input fails before any save or result report', async () => {
    const p = ports(); await assert.rejects(runWorkflow(importInput([POST, { ...COMMENT, score: '=1' }]), p, NOW));
    assert.equal(p.saves, 0); assert.equal(p.files.size, 0);
});
test('zero eligible records reports exclusions and never bills removed text', async () => {
    const p = ports(), summary = await runWorkflow(importInput([{ ...POST, contentState: 'removed' }]), p, NOW);
    assert.equal(summary.savedRecords, 0); assert.equal(summary.excludedDeletedRecords, 1); assert.equal(p.saves, 0);
});
test('private/non-PPE save is truthful about zero custom event fees', async () => {
    const p = ports(), summary = await runWorkflow(importInput([POST]), { ...p, save: async record => {
        p.rows.push(record); return { chargedCount: 0, eventChargeLimitReached: false }; } }, NOW);
    assert.equal(summary.savedRecords, 1); assert.equal(summary.confirmedResultEventCounts['post-scraped'], 0);
    assert(summary.chargeNotice.includes('No active monetization'));
});

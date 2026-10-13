import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { canSaveResult, saveConfirmed, resultEvent } from './billing.js';
import type { ChargingManager as Manager } from './billing.js';
import { runWorkflow } from './workflow.js';
import { importInput, NOW, POST, COMMENT } from './test-fixtures.js';

for (const type of ['post', 'comment'] as const) test(`SDK combined acknowledgment normalizes to one ${type} event`, async () => {
    let count = 0, writes = 0; const event = resultEvent(type);
    const manager: Manager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: { [event]: 0.002 } }),
        getChargedEventCount: () => count, calculateMaxEventChargeCountWithinLimit: () => count ? 0 : 1 };
    const result = await saveConfirmed({}, type, manager, async (_, name) => { writes++; assert.equal(name, event); count++; return { chargedCount: 2, eventChargeLimitReached: true }; });
    assert.deepEqual(result, { chargedCount: 1, eventChargeLimitReached: true }); assert.equal(writes, 1);
});
const invalidPrices: Record<string, number>[] = [{}, { 'post-scraped': 0 }, { 'post-scraped': NaN }, { 'post-scraped': 0.002, 'apify-default-dataset-item': 0.001 }];
for (const prices of invalidPrices) {
    test(`invalid result pricing prevents save ${JSON.stringify(prices)}`, async () => {
        let calls = 0; const manager: Manager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: prices }),
            getChargedEventCount: () => 0, calculateMaxEventChargeCountWithinLimit: () => 1 };
        await assert.rejects(saveConfirmed({}, 'post', manager, async () => { calls++; return { chargedCount: 1, eventChargeLimitReached: false }; })); assert.equal(calls, 0);
    });
}
for (const delta of [-1, 0, 2]) test(`bad custom counter delta ${delta} fails without retry`, async () => {
    let counter = 1, calls = 0; const manager: Manager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: { 'post-scraped': 0.002 } }),
        getChargedEventCount: () => counter, calculateMaxEventChargeCountWithinLimit: () => 1 };
    await assert.rejects(saveConfirmed({}, 'post', manager, async () => { calls++; counter += delta; return { chargedCount: 2, eventChargeLimitReached: false }; })); assert.equal(calls, 1);
});
test('private/pay-per-usage saves do not invent a custom charge or pass an event', async () => {
    let calls = 0; const manager: Manager = { getPricingInfo: () => ({ isPayPerEvent: false, perEventPrices: {} }),
        getChargedEventCount: () => 0, calculateMaxEventChargeCountWithinLimit: () => Infinity };
    assert.deepEqual(await saveConfirmed({}, 'post', manager, async (_, event) => { calls++; assert.equal(event, undefined); }),
        { chargedCount: 0, eventChargeLimitReached: false }); assert.equal(calls, 1);
});
const require = createRequire(import.meta.url);
test('zero spending limit guard runs again inside the save adapter', async () => {
    let calls = 0;
    const manager: Manager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: { 'post-scraped': 0.002 }, maxTotalChargeUsd: Infinity }),
        getChargedEventCount: () => 0, calculateMaxEventChargeCountWithinLimit: () => Infinity };
    assert.deepEqual(await saveConfirmed({}, 'post', manager, async () => { calls++; }, 0), { chargedCount: 0, eventChargeLimitReached: true });
    assert.equal(calls, 0);
});
for (const cap of [-1, NaN]) test(`invalid explicit spending limit ${cap} cannot save`, () => {
    const manager: Manager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: { 'post-scraped': 0.002 } }),
        getChargedEventCount: () => 0, calculateMaxEventChargeCountWithinLimit: () => 100 };
    assert.throws(() => canSaveResult('post', manager, cap));
});
test('start and other configured event counters reduce the available budget', () => {
    const counts: Record<string, number> = { 'post-scraped': 0, 'comment-scraped': 1, 'apify-actor-start': 1 };
    const manager: Manager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: { 'post-scraped': 0.002, 'comment-scraped': 0.001, 'apify-actor-start': 0.001 } }),
        getChargedEventCount: key => counts[key], calculateMaxEventChargeCountWithinLimit: () => Infinity };
    assert.equal(canSaveResult('post', manager, 0.003), false); assert.equal(canSaveResult('comment', manager, 0.003), true);
    assert.equal(canSaveResult('post', manager, 0.004), true);
});
// Internal SDK implementation is used ONLY by tests with a fake API client; production uses public APIs.
const { ChargingManager, pushDataAndCharge } = require(path.join(path.dirname(require.resolve('apify')), 'charging.js'));
for (const cap of [0, 0.002, 0.004]) test(`installed SDK exact/partial mixed result cap ${cap}, fake API only`, async () => {
    const charges: { eventName: string; count: number }[] = [], rows: unknown[] = [], files = new Map<string, unknown>();
    const config: Record<string, unknown> = { isAtHome: true, actorRunId: 'offline-fixture', maxTotalChargeUsd: cap,
        actorPricingInfo: JSON.stringify({ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: {
            'post-scraped': { eventPriceUsd: 0.002, eventTitle: 'Post' }, 'comment-scraped': { eventPriceUsd: 0.002, eventTitle: 'Comment' } } } }),
        chargedEventCounts: '{}', useChargingLogDataset: false };
    const manager = new ChargingManager({ get: (key: string) => config[key] }, { run: () => ({ charge: async (event: { eventName: string; count: number }) => { charges.push(event); } }) });
    await manager.init(); const rawAcks: number[] = [];
    const summary = await runWorkflow(importInput([POST, COMMENT]), {
        canSave: record => canSaveResult(record.recordType, manager, cap),
        save: record => saveConfirmed(record, record.recordType, manager, async (value, eventName) => {
            const result = await pushDataAndCharge({ chargingManager: manager, items: value, eventName, isDefaultDataset: true,
                pushFn: async (item: unknown) => { rows.push(item); } }); rawAcks.push(result.chargedCount); return result;
        }, cap), write: async (key, value) => { files.set(key, value); }, status: async () => undefined,
    }, NOW);
    const count = cap / 0.002; assert.equal(rows.length, count); assert.equal(charges.length, count); assert.equal(summary.savedRecords, count);
    assert.deepEqual(rawAcks, Array.from({ length: count }, () => 2)); assert(charges.every(event => event.count === 1));
    assert.equal(summary.completeSelectedOutput, count === 2); assert.equal(summary.reportsComplete, true); assert.equal(files.size, 8);
    assert.equal(summary.confirmedResultEventCounts['post-scraped'], count > 0 ? 1 : 0);
    assert.equal(summary.confirmedResultEventCounts['comment-scraped'], count > 1 ? 1 : 0);
});

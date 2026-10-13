import type { RecordType, SaveAcknowledgment } from './types.js';
export const resultEvent = (type: RecordType): string => type === 'post' ? 'post-scraped' : 'comment-scraped';
export interface ChargingManager {
    getPricingInfo(): { isPayPerEvent: boolean; perEventPrices: Record<string, number>; maxTotalChargeUsd?: number };
    getChargedEventCount(eventName: string): number;
    calculateMaxEventChargeCountWithinLimit(eventName: string): number;
}
export function canSaveResult(type: RecordType, manager: ChargingManager, explicitMaxTotalChargeUsd?: number): boolean {
    const info = manager.getPricingInfo(), event = resultEvent(type);
    if (!info.isPayPerEvent) return true;
    if (!Number.isFinite(info.perEventPrices[event]) || info.perEventPrices[event] <= 0 || (info.perEventPrices['apify-default-dataset-item'] ?? 0) > 0) {
        throw new Error('Required result pricing is missing or unexpected additional dataset pricing exists; no write attempted.');
    }
    const limits = [info.maxTotalChargeUsd ?? Infinity, explicitMaxTotalChargeUsd ?? Infinity];
    if (limits.some(value => typeof value !== 'number' || Number.isNaN(value) || value < 0)) throw new Error('Invalid spending limit; no write attempted.');
    const limit = Math.min(...limits);
    let charged = 0;
    for (const [name, price] of Object.entries(info.perEventPrices)) {
        if (!Number.isFinite(price) || price < 0) throw new Error('Invalid configured event price; no write attempted.');
        const count = manager.getChargedEventCount(name);
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Event counter unavailable; no write attempted.');
        charged += price * count;
    }
    // Preserve an explicit zero: the SDK currently converts a 0 limit to Infinity.
    return limit > 0 && charged + info.perEventPrices[event] <= limit + 1e-12
        && manager.calculateMaxEventChargeCountWithinLimit(event) > 0;
}
export async function saveConfirmed<T>(record: T, type: RecordType, manager: ChargingManager,
    push: (item: T, event?: string) => Promise<SaveAcknowledgment | void>, explicitMaxTotalChargeUsd?: number): Promise<SaveAcknowledgment> {
    const event = resultEvent(type), info = manager.getPricingInfo();
    // Private/pay-per-usage Actors have no active result price: save without pretending to bill a custom event.
    if (!info.isPayPerEvent) { await push(record); return { chargedCount: 0, eventChargeLimitReached: false }; }
    if (!canSaveResult(type, manager, explicitMaxTotalChargeUsd)) return { chargedCount: 0, eventChargeLimitReached: true };
    const before = manager.getChargedEventCount(event);
    if (!Number.isSafeInteger(before) || before < 0) throw new Error('Event counter unavailable; no write attempted.');
    const acknowledgment = await push(record, event), after = manager.getChargedEventCount(event), delta = after - before;
    if (!acknowledgment || !Number.isSafeInteger(acknowledgment.chargedCount) || typeof acknowledgment.eventChargeLimitReached !== 'boolean'
        || !Number.isSafeInteger(after) || after < 0 || ![0, 1].includes(delta) || acknowledgment.chargedCount < delta) throw new Error('Save/charge not confirmed; no retry attempted.');
    const limit = !canSaveResult(type, manager, explicitMaxTotalChargeUsd);
    if (!delta && !limit) throw new Error('Custom result event was not confirmed; no retry attempted.');
    return { chargedCount: delta, eventChargeLimitReached: limit };
}

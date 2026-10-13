import { normalizeInput } from './input.js';
import { prepareImport } from './importer.js';
import { demoRows } from './demo-presets.js';
import { buildResearchReport, changesCsv, insightsCsv, mentionsCsv, qualityCsv, researchMarkdown, threadsCsv } from './analysis.js';
import type { ResearchRecord, SaveAcknowledgment } from './types.js';
export interface Ports {
    canSave(record: ResearchRecord): boolean;
    save(record: ResearchRecord): Promise<SaveAcknowledgment>;
    write(key: string, value: unknown, contentType?: string): Promise<void>;
    status(message: string): Promise<void>;
}
export class DeliveryError extends Error { readonly code = 'DELIVERY_FAILED'; }
export async function runWorkflow(raw: unknown, ports: Ports, now = new Date()) {
    const input = normalizeInput(raw), isDemo = input.mode === 'demo';
    const plan = isDemo ? prepareImport({ mode: 'import', authorizedData: true, importSource: 'SYNTHETIC DEMO — invented posts/comments, not Reddit measurements',
        importJson: JSON.stringify(demoRows(input.demoPreset)), maxRecords: input.maxRecords, skipNSFW: input.skipNSFW,
        watchTerms: input.watchTerms, comparisonWindowDays: input.comparisonWindowDays }, now) : prepareImport(raw, now);
    const preview = plan.records.map(record => ({ ...record, source: 'synthetic-demo' as const, isSynthetic: true }));
    const saved: ResearchRecord[] = []; const confirmedEvents = { 'post-scraped': 0, 'comment-scraped': 0 };
    let spendingLimitReached = false, unconfirmed = false;
    if (!isDemo) for (const record of plan.records) {
        try {
            if (!ports.canSave(record)) { spendingLimitReached = true; break; }
            const acknowledgment = await ports.save(record);
            if (!acknowledgment || ![0, 1].includes(acknowledgment.chargedCount) || typeof acknowledgment.eventChargeLimitReached !== 'boolean') throw new DeliveryError('Unrecognized acknowledgment.');
            if (acknowledgment.chargedCount === 1 || !acknowledgment.eventChargeLimitReached) saved.push(record);
            confirmedEvents[record.recordType === 'post' ? 'post-scraped' : 'comment-scraped'] += acknowledgment.chargedCount;
            // A type-specific limit is not necessarily the other result type's limit. Recheck before each next save.
            if (acknowledgment.eventChargeLimitReached) spendingLimitReached = true;
            if (acknowledgment.eventChargeLimitReached && acknowledgment.chargedCount === 0) { spendingLimitReached = true; break; }
        } catch { unconfirmed = true; break; }
    }
    const records = isDemo ? preview : saved, analysis = buildResearchReport(records, input, plan.allEligibleKeys);
    const complete = isDemo || (!unconfirmed && saved.length === plan.records.length);
    const summary = { mode: input.mode, source: isDemo ? 'synthetic-demo' : 'authorized-export', isSynthetic: isDemo,
        outcome: unconfirmed ? 'failed_delivery' : isDemo ? 'demo_complete' : complete ? 'succeeded' : 'stopped_spending_limit',
        completeSelectedOutput: complete, reportsComplete: !unconfirmed, spendingLimitReached,
        inputRows: isDemo ? 0 : plan.inputRows, normalizedObservations: isDemo ? 0 : plan.normalizedObservations,
        duplicateObservations: isDemo ? 0 : plan.duplicateObservations, eligibleRecords: isDemo ? 0 : plan.eligibleRecords,
        selectedRecords: isDemo ? 0 : plan.records.length, omittedRecords: isDemo ? 0 : plan.omittedRecords,
        excludedDeletedRecords: isDemo ? 0 : plan.excludedDeletedRecords, excludedNSFWRecords: isDemo ? 0 : plan.excludedNSFWRecords,
        excludedRemovedThreadRecords: isDemo ? 0 : plan.excludedRemovedThreadRecords, unsupportedColumnsDropped: isDemo ? 0 : plan.unsupportedColumnsDropped,
        savedRecords: saved.length, savedPosts: saved.filter(record => record.recordType === 'post').length,
        savedComments: saved.filter(record => record.recordType === 'comment').length, unsavedSelectedRecords: isDemo ? 0 : plan.records.length - saved.length,
        previewRecords: isDemo ? preview.length : 0, previewObservations: isDemo ? analysis.observationsAnalyzed : 0,
        confirmedResultEventCounts: confirmedEvents, resultEventCountSource: 'Confirmed custom counters; inspect platform billing for final event counts.',
        unconfirmedDeliveryAttempt: unconfirmed, unconfirmedDeliveryNotice: unconfirmed ? 'An attempted write may already have saved/billed a row. No retry was attempted; inspect dataset and platform billing.' : null,
        upstreamRequestCount: 0, liveSourceVerified: false, sourceRightsVerified: false, authorFieldsIncluded: false,
        persistentHistoryWritten: false, demoPreset: isDemo ? input.demoPreset : null,
        chargeNotice: isDemo ? 'No post/comment result fees. Apify platform usage and any configured start fee still apply.'
            : 'A configured result event applies once per confirmed saved unique post/comment, not per observation or report. No active monetization means no custom event fee; platform usage still applies.' };
    try {
        await ports.write('REPORT', { summary, records, analysis });
        await ports.write('INSIGHTS.csv', insightsCsv(analysis), 'text/csv; charset=utf-8');
        await ports.write('THREADS.csv', threadsCsv(analysis), 'text/csv; charset=utf-8');
        await ports.write('MENTIONS.csv', mentionsCsv(analysis), 'text/csv; charset=utf-8');
        await ports.write('CHANGES.csv', changesCsv(analysis), 'text/csv; charset=utf-8');
        await ports.write('QUALITY.csv', qualityCsv(analysis), 'text/csv; charset=utf-8');
        await ports.write('REPORT.md', researchMarkdown(analysis), 'text/markdown; charset=utf-8');
        await ports.write('RUN_STATUS', summary);
    } catch {
        await ports.write('RUN_STATUS', { ...summary, outcome: 'failed_delivery', reportsComplete: false }).catch(() => undefined);
        throw new DeliveryError('Report write failed; saved records may retain configured event fees. No retry, extra save or source request.');
    }
    if (unconfirmed) throw new DeliveryError('Save/charge acknowledgment failed; attempted records may already be saved/billed. No retry or source request.');
    await ports.status(`${isDemo ? 'Synthetic demo' : complete ? 'Authorized import' : 'Partial import — spending limit'}: ${saved.length} dataset rows. No live Reddit lookup. Check RUN_STATUS for scope and charges.`);
    return summary;
}

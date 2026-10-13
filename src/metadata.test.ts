import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWorkflow } from './workflow.js';
import { normalizeInput } from './input.js';
import { prepareImport } from './importer.js';
import { buildResearchReport } from './analysis.js';
import { importInput, NOW, POST, COMMENT } from './test-fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file: string): any => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const actor = readJson('.actor/actor.json'), schema = readJson('INPUT_SCHEMA.json');
const output = readJson('.actor/output_schema.json'), dataset = readJson('.actor/dataset_schema.json');
const copy = readJson('release/store-copy.json'), proposal = readJson('release/pricing-proposal.json');
const examples = readJson('release/us-examples.json');

test('build metadata does not silently activate a pricing proposal', () => {
    assert.equal(actor.name, 'reddit-posts-comments-scraper'); assert.equal(actor.pricingInfo, undefined);
    assert.equal(proposal.status, 'PRIVATE_BILLING_VERIFIED_RELEASE_PREPARED'); assert.equal(proposal.requiresSeparateApproval, true);
    assert.equal(proposal.publicReleaseApproved, true); assert(proposal.publicReleaseApprovalScope.includes('approval received'));
    assert.equal(proposal.finalReleaseApprovalId, 'call_oohnxu1bly7T9sS4hMR4nPuc'); assert.equal(proposal.finalReleaseSoftTargetUsd, 0.03);
    assert.equal(proposal.actualCloudCostsVerified, true); assert.equal(proposal.actualEventBillingVerified, true);
    assert.equal(actor.defaultRunOptions.memoryMbytes, 256); assert.equal(actor.defaultRunOptions.timeoutSecs, 90);
    assert.equal(copy.status, 'release_prepared_not_published'); assert.equal(examples.publicationStatus, 'release_prepared_not_published');
});
test('price-readiness metadata exposes demo losses and bounds the private pricing verification', () => {
    assert.equal(actor.minMemoryMbytes, 256); assert.equal(actor.maxMemoryMbytes, 256);
    assert.equal(proposal.proposedStartFeeUsd, 0.001);
    const review = proposal.prePricingReview;
    assert.equal(review.applied, true); assert.equal(review.approved, true); assert.equal(review.requiresExplicitOwnerApproval, true);
    assert.equal(review.requiresSeparateActivationAndBillingApproval, true);
    assert.equal(review.policyApprovalId, 'call_71477be614e64e2aa90d6290c9858a71');
    assert.equal(review.recommendedStartEvent, 'apify-actor-start'); assert.equal(review.recommendedStartFeeUsd, 0.001);
    assert.equal(review.recommendedMinimalMaxTotalChargeUsd, review.recommendedStartFeeUsd + proposal.events['post-scraped'].proposedPriceUsd);
    assert.equal(review.minimumCapIsNotMinimumActualCharge, true); assert.equal(review.computeWaiverCreditAssumedUsd, 0);
    for (const measured of review.measuredDemoUsageUsd) {
        assert(measured > 0.00005 * (1 - review.standardShare));
        assert((review.recommendedStartFeeUsd * (1 - review.standardShare) - measured) / review.recommendedStartFeeUsd >= 0.25);
    }
    assert(review.recommendedStartImportModeledMarginRange[0] >= 0.25);
});
test('Store copy and Actor identity describe the same limited offering', () => {
    assert.equal(copy.title, actor.title); assert.equal(copy.description, actor.description);
    assert(actor.title.length <= 64); assert(copy.seoTitle.length <= 50); assert(copy.seoDescription.length <= 156);
    assert(/No live/.test(actor.description)); assert(!/No API Key|full comment threads|unlimited|cheapest|best scraper/i.test(actor.title + actor.description));
});
test('strong Reddit SEO and original Actor icon remain truthful', () => {
    assert.equal(actor.title, 'Reddit Customer Research & Competitor Insights');
    assert.equal(copy.seoTitle, actor.title); assert(copy.seoDescription.includes('licensed Reddit CSV/JSON'));
    assert(copy.description.includes('No live scraping')); assert(copy.runtimeScope.includes('no country inference'));
    const icon = fs.readFileSync(path.join(root, copy.iconFile));
    assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20)); assert(icon.readUInt32BE(16) >= 512);
    assert(copy.iconProvenance.includes('no Reddit/Snoo')); assert(copy.iconProvenance.includes('personal account-photo'));
});
test('public fee disclosures match verified private billing without guarantees', () => {
    const proof = proposal.billingVerification;
    assert.equal(proof.exactStartAndResultCountsVerified, true); assert.equal(proof.omittedCommentWasNotCharged, true);
    assert.equal(proof.confirmedGrossFeesUsd.length, proof.measuredUsageUsd.length);
    for (const [index, revenue] of proof.confirmedGrossFeesUsd.entries()) {
        assert((revenue * (1 - proposal.assumedApifyShareForModelOnly) - proof.measuredUsageUsd[index]) / revenue >= 0.25);
    }
    assert(proof.peakMemoryMiB < 230.4); assert(proof.nearLimitInputPeakMiBReused < 230.4);
    assert.equal(proof.remainingPaidBuildApprovalRequired, false); assert.equal(proof.cloudRunApprovalConsumed, true);
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert(readme.includes('$2/1,000')); assert(readme.includes('$0.001')); assert(readme.includes('$0.003'));
    assert(readme.includes('not an additional fee or minimum actual charge')); assert(readme.includes('not a free run'));
    assert(!/billing.{0,15}pending|Actor remains \*\*private\*\*|not a public paid release/.test(readme));
    for (const example of examples.examples) assert(example.description.includes('$0.001/start') && example.description.includes('not a free run'));
});
test('input schema contains no source/proxy/AI route and no automatic consent', () => {
    assert.deepEqual(schema.required, ['mode']); assert.equal(schema.properties.mode.default, undefined);
    assert.equal(schema.properties.authorizedData.default, false);
    assert.equal(schema.properties.importJson.isSecret, true); assert.equal(schema.properties.importCsv.isSecret, true);
    assert.deepEqual(schema.properties.mode.enum, ['demo', 'import']);
    for (const key of ['subreddits', 'keywords', 'postUrls', 'proxyConfiguration', 'accessToken', 'enableAiAnalysis']) assert.equal(schema.properties[key], undefined);
    const defaults: Record<string, unknown> = { mode: 'demo' };
    for (const [key, value] of Object.entries(schema.properties)) if (Object.hasOwn(value as object, 'default')) defaults[key] = (value as any).default;
    assert.equal(normalizeInput(defaults).mode, 'demo');
});
test('dataset fields and table views map to actual normalized saved records', () => {
    const record = prepareImport(importInput([POST, COMMENT]), NOW).records[0];
    assert.deepEqual(Object.keys(dataset.fields.properties).sort(), Object.keys(record).sort());
    for (const view of Object.values(dataset.views) as any[]) {
        assert.deepEqual(Object.keys(view.display.properties).sort(), [...view.transformation.fields].sort());
        for (const key of view.transformation.fields) assert(key in record);
    }
    assert(!JSON.stringify(dataset).includes('authorUsername')); assert(!JSON.stringify(dataset).includes('postUrl'));
});
test('all output links map to actual successful run artifacts', async () => {
    const files = new Map<string, unknown>();
    await runWorkflow({ mode: 'demo' }, { canSave: () => true, save: async () => { throw new Error('demo cannot save'); },
        write: async (key, value) => { files.set(key, value); }, status: async () => undefined }, NOW);
    const templates: string[] = Object.values(output.properties).map((value: any) => value.template);
    const targets = templates.filter(template => template.includes('/records/')).map(template => template.split('/records/')[1]);
    assert.deepEqual(targets.sort(), [...files.keys()].sort()); assert.equal(targets.length, 8);
    assert(templates.includes('{{links.apiDefaultDatasetUrl}}/items'));
});
for (const example of examples.examples) test(`US example ${example.name} is synthetic, functional and does not confer rights`, async () => {
    const input = readJson(example.inputFile); assert.equal(input.mode, 'demo');
    assert(/Synthetic Preview/.test(example.title)); assert(/invented/i.test(example.description));
    assert.equal(input.authorizedData, undefined); assert.equal(input.importJson, undefined); assert.equal(input.importCsv, undefined);
    assert(!example.visibleFields.includes('mode')); assert(!example.visibleFields.includes('authorizedData'));
    for (const key of example.visibleFields) assert(schema.properties[key]);
    const records: unknown[] = [], files = new Map<string, any>();
    const summary = await runWorkflow(input, { canSave: () => true, save: async record => { records.push(record); throw new Error('Unexpected demo save'); },
        write: async (key, value) => { files.set(key, value); }, status: async () => undefined }, NOW);
    assert.equal(summary.savedRecords, 0); assert.equal(records.length, 0); assert.equal(summary.sourceRightsVerified, false);
    assert.equal(summary.upstreamRequestCount, 0); assert.equal(summary.reportsComplete, true); assert.equal(files.get('REPORT').analysis.isSynthetic, true);
});
test('runtime has no retired collection library or direct source request call', () => {
    const pkg = readJson('package.json'); assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@apify/input_secrets', 'apify']);
    for (const file of ['main', 'stored-input', 'routes', 'importer', 'workflow', 'input', 'analysis', 'demo-presets', 'csv', 'billing']) {
        const code = fs.readFileSync(path.join(root, `src/${file}.ts`), 'utf8');
        assert(!/HttpCrawler|gotScraping|createProxyConfiguration|https?:\/\/[^'"\s]*reddit|\bfetch\s*\(|axios|puppeteer|playwright|\.charge\s*\(/.test(code), file);
    }
});
test('migration description is not a promise to retain old live tasks', () => {
    assert(copy.migrationNotice.includes('retired')); assert(copy.migrationNotice.includes('must be replaced'));
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert(readme.includes('not a live Reddit scraper')); assert(readme.includes('LEGACY_INPUT_RETIRED'));
    assert(readme.includes('not complete anonymization')); assert(readme.includes('do not guarantee availability or profit'));
});
test('alias normalization cannot write prototype or author columns into output', () => {
    const extra = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"author":"DO_NOT_EXPORT"}');
    const plan = prepareImport(importInput([{ ...POST, ...extra }]), NOW);
    assert.equal(({} as any).polluted, undefined); assert(!JSON.stringify(plan.records).includes('DO_NOT_EXPORT'));
    assert.equal(plan.unsupportedColumnsDropped, 3);
});
test('CSV imports preserve negative numeric scores without changing the metric basis', () => {
    const csv = 'recordType,postId,commentId,bodyText,createdAt,observedAt,parentCommentId,score,isNSFW\ncomment,abc123,reply01,Please add exports,2026-10-11,2026-10-12,,-2,false';
    const record = prepareImport({ mode: 'import', authorizedData: true, importSource: 'Owner-invented QA', importCsv: csv }, NOW).records[0];
    assert.equal(record.score, -2); assert.equal(record.scoreBasis, 'reported-score'); assert.equal(record.parentKnown, true);
});
test('single supplied snapshot has explicit unknown differences, not invented growth', () => {
    const raw = importInput([POST]), report = buildResearchReport(prepareImport(raw, NOW).records, normalizeInput(raw));
    assert.equal(report.changes[0].comparisonAvailable, false); assert.equal(report.changes[0].scoreDelta, null);
    assert.equal(report.changes[0].declaredCommentCountDelta, null); assert.equal(report.changes[0].suppliedTextChanged, null);
});

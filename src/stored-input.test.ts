import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { encryptInputSecrets } from '@apify/input_secrets';
import { MAX_STORED_INPUT_BYTES, readStoredInput } from './stored-input.js';
import { runWorkflow } from './workflow.js';
import { importInput, POST, COMMENT, NOW } from './test-fixtures.js';
import fs from 'node:fs';

const inputSchema = JSON.parse(fs.readFileSync(new URL('../INPUT_SCHEMA.json', import.meta.url), 'utf8'));
const passphrase = 'owner-invented-test-key-not-a-production-secret';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyFile = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase })).toString('base64');

test('native stored INPUT reading retains explicit mode without auto-consent/default mutation', async () => {
    const input = { mode: 'demo' }; let reads = 0;
    assert.deepEqual(await readStoredInput({ readBuffer: async () => { reads++; return { value: Buffer.from(JSON.stringify(input)) }; } }), input);
    assert.equal(reads, 1); assert.equal(inputSchema.properties.mode.default, undefined);
});
for (const [name, value] of Object.entries({ missing: undefined, null: Buffer.from('null'), array: Buffer.from('[]'),
    json5: Buffer.from("{mode:'demo'}"), invalidUtf8: Buffer.from([0xff, 0xfe]), object: { mode: 'demo' },
    empty: Buffer.from(''), tooLarge: Buffer.alloc(MAX_STORED_INPUT_BYTES + 1) })) {
    test(`stored INPUT rejects ${name} before saving`, async () => {
        await assert.rejects(readStoredInput({ readBuffer: async () => value === undefined ? undefined : { value } }));
    });
}
test('BOM-prefixed JSON and supported buffered/string responses parse consistently', async () => {
    for (const value of ['\uFEFF{"mode":"demo"}', new Uint8Array(Buffer.from('{"mode":"demo"}'))]) {
        assert.deepEqual(await readStoredInput({ readBuffer: async () => ({ value }) }), { mode: 'demo' });
    }
});
for (const kind of ['json', 'csv']) test(`real Apify ${kind} input secret encryption round-trips and produces correct reports offline`, async () => {
    const raw = kind === 'json' ? importInput([POST, COMMENT]) : { mode: 'import', authorizedData: true, importSource: 'Owner-invented synthetic QA',
        importCsv: 'recordType,postId,title,createdAt,observedAt,isNSFW\npost,abc123,Please add exports,2026-10-10,2026-10-12,false' };
    const encrypted = encryptInputSecrets({ input: { ...raw }, inputSchema, publicKey });
    const payload = kind === 'json' ? 'importJson' : 'importCsv';
    assert(/^ENCRYPTED_VALUE:/.test((encrypted as Record<string, unknown>)[payload] as string));
    const decoded = await readStoredInput({ readBuffer: async () => ({ value: Buffer.from(JSON.stringify(encrypted)) }), privateKeyFile, privateKeyPassphrase: passphrase });
    assert.deepEqual(decoded, raw);
    let saves = 0; const artifacts = new Map<string, unknown>();
    const result = await runWorkflow(decoded, { canSave: () => true, save: async () => { saves++; return { chargedCount: 0, eventChargeLimitReached: false }; },
        write: async (key, value) => { artifacts.set(key, value); }, status: async () => undefined }, NOW);
    assert.equal(result.savedRecords, kind === 'json' ? 2 : 1); assert.equal(saves, result.savedRecords); assert.equal(artifacts.size, 8);
});
for (const kind of ['missing-key', 'wrong-key', 'malformed-ciphertext']) test(`encrypted input ${kind} fails without returning/leaking payload text`, async () => {
    const encrypted = encryptInputSecrets({ input: importInput([POST]), inputSchema, publicKey });
    if (kind === 'malformed-ciphertext') encrypted.importJson = 'ENCRYPTED_VALUE:invalid:ciphertext';
    await assert.rejects(readStoredInput({ readBuffer: async () => ({ value: Buffer.from(JSON.stringify(encrypted)) }),
        privateKeyFile: kind === 'missing-key' ? undefined : 'not-a-valid-key', privateKeyPassphrase: passphrase }),
    (error: Error) => !error.message.includes('ciphertext') && !error.message.includes(POST.title));
});

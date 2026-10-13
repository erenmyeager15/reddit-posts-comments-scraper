import { Buffer } from 'node:buffer';
import { createPrivateKey } from 'node:crypto';
import { decryptInputSecrets } from '@apify/input_secrets';
import { InputError, inputObject } from './input.js';

export const MAX_STORED_INPUT_BYTES = 6 * 1024 * 1024;
export interface StoredInputPorts {
    readBuffer(): Promise<{ value: unknown } | undefined>;
    privateKeyFile?: string;
    privateKeyPassphrase?: string;
}
/** Read only the current Actor INPUT through its public storage client, not an arbitrary source URL. */
export async function readStoredInput(ports: StoredInputPorts): Promise<Record<string, unknown>> {
    const record = await ports.readBuffer();
    if (!record) throw new InputError('Actor INPUT is missing; choose an explicit demo or authorized import.');
    const value = record.value;
    if (typeof value !== 'string' && !(value instanceof Uint8Array)) throw new InputError('Stored INPUT must be JSON bytes.');
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.length > MAX_STORED_INPUT_BYTES) throw new InputError('Stored INPUT exceeds 6 MiB including JSON/encryption overhead.');
    let parsed: unknown;
    // Native JSON parsing avoids the per-character memory overhead of the local JSON5 storage parser.
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')); }
    catch { throw new InputError('Stored INPUT must be valid UTF-8 JSON, not JSON5, a URL or a file reference.'); }
    const input = inputObject(parsed);
    const encrypted = Object.values(input).some(item => typeof item === 'string' && /^ENCRYPTED_(?:VALUE|JSON):/.test(item));
    if (!encrypted) return input;
    if (!ports.privateKeyFile || !ports.privateKeyPassphrase) throw new InputError('Encrypted INPUT requires the configured Apify secret-input decryption key.', 'INPUT_DECRYPTION_FAILED');
    try {
        const privateKey = createPrivateKey({ key: Buffer.from(ports.privateKeyFile, 'base64'), passphrase: ports.privateKeyPassphrase });
        return inputObject(decryptInputSecrets({ input, privateKey }));
    } catch { throw new InputError('Encrypted INPUT could not be decrypted. No result write attempted.', 'INPUT_DECRYPTION_FAILED'); }
}

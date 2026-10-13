import { Actor } from 'apify';
import { InputError } from './input.js';
import { canSaveResult, saveConfirmed } from './billing.js';
import { runWorkflow } from './workflow.js';
import { readStoredInput } from './stored-input.js';

Actor.main(async () => {
    const manager = Actor.getChargingManager(), explicitLimit = Actor.config.get('maxTotalChargeUsd');
    try {
        const store = await Actor.openKeyValueStore();
        const input = await readStoredInput({
            readBuffer: () => Actor.config.getStorageClient().keyValueStore(store.id).getRecord(Actor.config.get('inputKey'), { buffer: true }),
            privateKeyFile: Actor.config.get('inputSecretsPrivateKeyFile'),
            privateKeyPassphrase: Actor.config.get('inputSecretsPrivateKeyPassphrase'),
        });
        await runWorkflow(input, {
            canSave: record => canSaveResult(record.recordType, manager, explicitLimit),
            save: record => saveConfirmed(record, record.recordType, manager, (item, event) => event ? Actor.pushData(item, event) : Actor.pushData(item), explicitLimit),
            write: async (key, value, contentType) => { await Actor.setValue(key, value, contentType ? { contentType } : undefined); },
            status: async message => { await Actor.setStatusMessage(message); },
        });
    } catch (error) {
        if (error instanceof InputError) {
            await Actor.setValue('RUN_STATUS', { outcome: 'invalid_input', code: error.code, message: error.message,
                savedRecords: 0, resultEventsAttempted: 0, upstreamRequestCount: 0, liveSourceVerified: false, sourceRightsVerified: false });
            await Actor.setStatusMessage(error.message);
        }
        throw error;
    }
});

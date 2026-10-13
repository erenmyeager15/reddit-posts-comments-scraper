import type { ResearchInput } from './types.js';
import { redactText } from './routes.js';

export class InputError extends Error { constructor(message: string, readonly code = 'INVALID_INPUT') { super(message); } }
export function inputObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('Input must be a JSON object.');
    return raw as Record<string, unknown>;
}
export function integerOption(raw: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
    const value = raw[key] === undefined ? fallback : raw[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new InputError(`${key} must be an integer between ${min} and ${max}.`);
    return value;
}
export function normalizeInput(raw: unknown): ResearchInput {
    const object = inputObject(raw);
    const retired = ['subreddits', 'keywords', 'postUrls', 'sortBy', 'timeFilter', 'maxPostsPerSubreddit', 'maxCommentsPerPost',
        'proxyConfiguration', 'startUrls', 'redditClientId', 'redditClientSecret', 'accessToken', 'enableAiAnalysis'];
    if (retired.some(field => Object.hasOwn(object, field))) throw new InputError('Live Reddit collection and API/AI credentials are retired here. Remove old source/proxy fields. Choose demo for labeled invented research, or import for an export licensed for this paid analysis service. No Reddit request or result fee was attempted; platform usage may apply.', 'LEGACY_INPUT_RETIRED');
    if (object.mode !== 'demo' && object.mode !== 'import') throw new InputError('Choose mode demo or import explicitly. This Actor does not retrieve Reddit content.');
    if (object.mode === 'import' && object.authorizedData !== true) throw new InputError('Confirm that this export and derived analysis are licensed for this paid service. Confirmation does not verify or grant permission.', 'SOURCE_RIGHTS_REQUIRED');
    const allowed = ['mode', 'demoPreset', 'maxRecords', 'skipNSFW', 'watchTerms', 'comparisonWindowDays', 'removedRecordKeys',
        'authorizedData', 'importSource', 'importJson', 'importCsv'];
    if (Object.keys(object).some(key => !allowed.includes(key))) throw new InputError('Input has unsupported fields; use the documented import/demo schema.');
    const preset = object.demoPreset ?? 'us-saas-research';
    if (!['us-saas-research', 'us-brand-comparison', 'us-thread-quality'].includes(String(preset))) throw new InputError('Unknown synthetic demo preset.');
    const skip = object.skipNSFW ?? true; if (typeof skip !== 'boolean') throw new InputError('skipNSFW must be a boolean.');
    const terms = object.watchTerms ?? [];
    if (!Array.isArray(terms) || terms.length > 10 || terms.some(term => typeof term !== 'string' || term.trim().length < 2 || term.length > 40
        || redactText(term) !== term.trim() || /[\r\n\t]/.test(term))) throw new InputError('watchTerms must contain at most 10 non-sensitive literal terms, 2–40 characters each.');
    const watchTerms = (terms as string[]).map(term => term.trim());
    if (new Set(watchTerms.map(term => term.toLowerCase())).size !== watchTerms.length) throw new InputError('watchTerms must be unique, ignoring case.');
    const removed = object.removedRecordKeys ?? [];
    if (!Array.isArray(removed) || removed.length > 1000 || removed.some(key => typeof key !== 'string' || !/^t[13]_[a-z0-9]{1,20}$/.test(key))) {
        throw new InputError('removedRecordKeys must contain at most 1,000 t3_post / t1_comment keys. They suppress supplied records, not previously stored cloud runs.');
    }
    // The input form can include inert defaults. Never silently ignore actual imports or consent in demo mode.
    if (object.mode === 'demo' && (object.authorizedData !== undefined && object.authorizedData !== false
        || ['importSource', 'importJson', 'importCsv'].some(key => object[key] !== undefined && (typeof object[key] !== 'string' || String(object[key]).trim() !== ''))
        || removed.length > 0)) {
        throw new InputError('Demo accepts only synthetic preset/research options; leave import fields empty and rights confirmation unchecked.');
    }
    return { mode: object.mode, demoPreset: preset as ResearchInput['demoPreset'], maxRecords: integerOption(object, 'maxRecords', 100, 1, 500),
        skipNSFW: skip, watchTerms, comparisonWindowDays: integerOption(object, 'comparisonWindowDays', 30, 1, 365), removedRecordKeys: [...new Set(removed as string[])] };
}

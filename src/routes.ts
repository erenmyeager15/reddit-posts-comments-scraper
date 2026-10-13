import { InputError } from './input.js';
import type { Signal } from './types.js';

export function redactText(value: string): string {
    return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
        .replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, '[link removed]')
        .replace(/(?:\bu\/|\/u\/)[A-Za-z0-9_-]{1,40}/gi, '[username removed]')
        .replace(/\b(?:password|api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*[^\s,;]+/gi, '[credential removed]')
        .replace(/(?<!\w)(?:\+?\d[\d ()-]{6,}\d)(?!\w)/g, match => match.replace(/\D/g, '').length >= 7 ? '[number removed]' : match)
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}
export const normalizeHeader = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export const round = (value: number): number => Math.round(value * 1e6) / 1e6;
export function csvCell(value: unknown): string {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
}
export function csvRows(headers: string[], rows: unknown[][]): string {
    return [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n') + '\r\n';
}
export function parseUtc(value: unknown, field: string, now: Date): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) {
        throw new InputError(`${field} must be YYYY-MM-DD or a UTC ISO timestamp ending in Z.`, 'INVALID_IMPORT');
    }
    const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)
        || (value.length > 10 && date.toISOString().slice(11, 19) !== value.slice(11, 19)) || date.getTime() > now.getTime()) {
        throw new InputError(`${field} contains an impossible or future date/time.`, 'INVALID_IMPORT');
    }
    return date.toISOString();
}
export function researchSignals(title: string | null, body: string | null): Signal[] {
    const text = `${title ?? ''}\n${body ?? ''}`;
    const rules: [Signal, RegExp][] = [
        ['pain-point-phrase', /\b(?:frustrat\w*|struggl\w*|broken|unreliable|too slow|too expensive|cannot|can't|doesn't work|does not work)\b/i],
        ['feature-request-phrase', /\b(?:i wish|we wish|would like|feature request|please add|needs? a feature)\b/i],
        ['recommendation-question', /\b(?:any recommendations|what (?:tool|app|software) do you use|can (?:anyone|you) recommend)\b|\brecommend\w*\b[^?\n]*\?/i],
        ['switching-phrase', /\b(?:alternative to|alternatives to|switching from|switch from|replace my|replace our)\b/i],
        ['pricing-question', /\b(?:how much|worth (?:the|it)|pricing|price)\b[^?\n]*\?/i],
        ['question', /\?/],
    ];
    return rules.filter(([, pattern]) => pattern.test(text)).map(([signal]) => signal);
}
export function matchingTerms(text: string, terms: string[]): string[] {
    return terms.filter(term => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const start = /^[\p{L}\p{N}_]/u.test(term) ? '(?<![\\p{L}\\p{N}_])' : '';
        const end = /[\p{L}\p{N}_]$/u.test(term) ? '(?![\\p{L}\\p{N}_])' : '';
        return new RegExp(start + escaped + end, 'iu').test(text);
    });
}

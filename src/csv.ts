import { Buffer } from 'node:buffer';
import { InputError } from './input.js';
import { normalizeHeader } from './routes.js';
export const MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 1000;
export function boundedText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > MAX_BYTES || value.includes('\0')) {
        throw new InputError('Import must be nonempty text, at most 2 MiB, without null characters.', 'INVALID_IMPORT');
    }
    return value.replace(/^\uFEFF/, '');
}
/** Quoted/multiline CSV only: never evaluate formulae or fetch file/URL references. */
export function parseCsv(value: unknown): Record<string, unknown>[] {
    const text = boundedText(value), rows: string[][] = [];
    let row: string[] = [], parts: string[] = [], quoted = false, closed = false;
    const finishCell = (): void => { row.push(parts.join('')); parts = []; closed = false; };
    const push = (): void => { finishCell(); if (row.some(item => item.trim())) rows.push(row);
        if (rows.length > MAX_ROWS + 1) throw new InputError('Import exceeds 1,000 observations.', 'INVALID_IMPORT');
        row = []; };
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quoted) {
            // Append spans, not one-character ropes, for large quoted/multiline fields.
            const end = text.indexOf('"', index);
            if (end === -1) break;
            if (end > index) parts.push(text.slice(index, end));
            index = end;
            if (text[index + 1] === '"') { parts.push('"'); index++; }
            else { quoted = false; closed = true; }
        } else if (char === ',') {
            finishCell();
            if (row.length >= 40) throw new InputError('CSV exceeds 40 columns.', 'INVALID_IMPORT');
        } else if (char === '\r' || char === '\n') { if (char === '\r' && text[index + 1] === '\n') index++; push(); }
        else if (char === '"') { if (parts.length || closed) throw new InputError('Misplaced CSV quote.', 'INVALID_IMPORT'); quoted = true; }
        else if (closed) { if (char !== ' ' && char !== '\t') throw new InputError('Text follows a CSV closing quote.', 'INVALID_IMPORT'); }
        else {
            let end = index + 1;
            while (end < text.length && ![',', '"', '\r', '\n'].includes(text[end])) end++;
            parts.push(text.slice(index, end)); index = end - 1;
        }
    }
    if (quoted) throw new InputError('Unclosed CSV field.', 'INVALID_IMPORT');
    if (parts.length || row.length || closed) push();
    if (rows.length < 2) throw new InputError('CSV needs a header and a record.', 'INVALID_IMPORT');
    const headers = rows.shift()!;
    if (headers.length > 40 || headers.some(header => !header.trim() || header.length > 100)
        || new Set(headers.map(normalizeHeader)).size !== headers.length) throw new InputError('CSV headers are empty, too long or duplicated.', 'INVALID_IMPORT');
    return rows.map(values => { if (values.length !== headers.length) throw new InputError('CSV row/header column counts differ.', 'INVALID_IMPORT');
        return Object.fromEntries(headers.map((header, index) => [header, values[index]])); });
}

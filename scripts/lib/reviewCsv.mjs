import { validateReviewedMessage } from './catalogValidation.mjs';

export function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n') {
      throw new Error(`Unexpected character after closing quote at position ${index}`);
    }
    if (char === '"') {
      if (field !== '' || afterQuote) throw new Error(`Unexpected quote in unquoted field at position ${index}`);
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      afterQuote = false;
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      afterQuote = false;
    } else {
      if (afterQuote) throw new Error(`Unexpected character after closing quote at position ${index}`);
      field += char;
    }
  }
  if (quoted) throw new Error('Unterminated quoted field');
  if (row.length > 0 || field.length > 0 || afterQuote) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function encodeField(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function stringifyCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(encodeField).join(',')).join('\r\n')}\r\n`;
}

export function reviewHeader(code) {
  return ['key', 'domain', 'note', 'max_len', 'en', code, `reviewed_${code}`];
}

export function applyReviewedRows({ rows, code, catalog, source, en, context }) {
  const updatedCatalog = { ...catalog };
  const updatedSource = { ...source };
  const errors = [];
  const changedKeys = [];
  const header = reviewHeader(code);
  const headerRow = rows[0] ?? [];
  if (JSON.stringify(headerRow) !== JSON.stringify(header)) {
    return {
      catalog: updatedCatalog,
      source: updatedSource,
      changedKeys,
      errors: [{ key: '*', reason: `CSV header must be ${header.join(',')}` }],
    };
  }

  const seenKeys = new Set();
  for (const [index, values] of rows.slice(1).entries()) {
    if (values.every((value) => value === '')) continue;
    const record = Object.fromEntries(header.map((name, column) => [name, values[column] ?? '']));
    const key = record.key || `row ${index + 2}`;
    if (values.length !== header.length) {
      errors.push({ key, reason: `expected ${header.length} columns, found ${values.length}` });
      continue;
    }
    if (!record.key || !Object.hasOwn(en, record.key)) {
      errors.push({ key, reason: 'unknown catalog key' });
      continue;
    }
    if (seenKeys.has(record.key)) {
      errors.push({ key, reason: 'duplicate review row' });
      continue;
    }
    seenKeys.add(record.key);
    const reviewed = record[`reviewed_${code}`];
    if (!reviewed || reviewed === catalog[record.key]) continue;
    const validationErrors = validateReviewedMessage({
      locale: code,
      key: record.key,
      message: reviewed,
      enMessage: en[record.key],
      contextEntry: context[record.key],
    });
    if (validationErrors.length > 0) {
      errors.push({ key, reason: validationErrors.join('; ') });
      continue;
    }
    updatedCatalog[record.key] = reviewed;
    updatedSource[record.key] = en[record.key];
    changedKeys.push(record.key);
  }
  return { catalog: updatedCatalog, source: updatedSource, changedKeys, errors };
}

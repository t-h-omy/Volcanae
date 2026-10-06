import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { reviewHeader, stringifyCsv } from './lib/reviewCsv.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localeDirectory = resolve(root, 'src/i18n/locales');
const localeFiles = (await readdir(localeDirectory))
  .filter((file) => file.endsWith('.json') && file !== 'en.json')
  .map((file) => file.slice(0, -5));
const code = process.argv[2];

if (!code || !localeFiles.includes(code)) {
  console.error(`Usage: npm run i18n:export -- <locale>; locale must be one of ${localeFiles.join(', ')}`);
  process.exit(1);
}

const [en, catalog, context] = await Promise.all([
  readFile(resolve(localeDirectory, 'en.json'), 'utf8').then(JSON.parse),
  readFile(resolve(localeDirectory, `${code}.json`), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'src/i18n/context.json'), 'utf8').then(JSON.parse),
]);
const header = reviewHeader(code);
const rows = [header];
for (const key of Object.keys(en).sort()) {
  const entry = context[key] ?? {};
  rows.push([
    key,
    key.split('.')[0],
    entry.note ?? '',
    entry.maxLen ?? '',
    en[key],
    catalog[key] ?? '',
    '',
  ]);
}

const outputDirectory = resolve(root, 'i18n-review');
await mkdir(outputDirectory, { recursive: true });
const output = resolve(outputDirectory, `${code}.csv`);
await writeFile(output, stringifyCsv(rows), 'utf8');
console.log(`Wrote ${output}`);

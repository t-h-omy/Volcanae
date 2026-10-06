import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { applyReviewedRows, parseCsv } from './lib/reviewCsv.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localeDirectory = resolve(root, 'src/i18n/locales');
const code = process.argv[2];
const csvPath = process.argv[3];
const localeFiles = (await readdir(localeDirectory))
  .filter((file) => file.endsWith('.json') && file !== 'en.json')
  .map((file) => file.slice(0, -5));

if (!code || !csvPath || code === 'en' || !localeFiles.includes(code)) {
  console.error(`Usage: npm run i18n:import -- <locale> <csv>; locale must be one of ${localeFiles.join(', ')}`);
  process.exit(1);
}

let rows;
try {
  rows = parseCsv(await readFile(resolve(process.cwd(), csvPath), 'utf8'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const [en, catalog, source, context] = await Promise.all([
  readFile(resolve(localeDirectory, 'en.json'), 'utf8').then(JSON.parse),
  readFile(resolve(localeDirectory, `${code}.json`), 'utf8').then(JSON.parse),
  readFile(resolve(localeDirectory, `sources/${code}.json`), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'src/i18n/context.json'), 'utf8').then(JSON.parse),
]);
const result = applyReviewedRows({ rows, code, catalog, source, en, context });
for (const { key, reason } of result.errors) console.error(`${key}: ${reason}`);
if (result.errors.length > 0) process.exitCode = 1;
if (result.changedKeys.length > 0) {
  await Promise.all([
    writeFile(resolve(localeDirectory, `${code}.json`), `${JSON.stringify(result.catalog, null, 2)}\n`),
    writeFile(resolve(localeDirectory, `sources/${code}.json`), `${JSON.stringify(result.source, null, 2)}\n`),
  ]);
}
console.log(`Updated ${result.changedKeys.length} reviewed message(s) for ${code}.`);

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, extname } from 'node:path';
import { parseCsv } from './lib/reviewCsv.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localeDirectory = resolve(root, 'src/i18n/locales');
const locales = (await readdir(localeDirectory))
  .filter((file) => file.endsWith('.json') && file !== 'en.json')
  .map((file) => file.slice(0, -5));
const [en, context, glossaryText] = await Promise.all([
  readFile(resolve(localeDirectory, 'en.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'src/i18n/context.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'src/i18n/glossary.csv'), 'utf8'),
]);
const glossary = parseCsv(glossaryText);
const glossaryHeaders = glossary[0] ?? [];
const glossaryTerms = glossary.slice(1).map((row) => Object.fromEntries(
  glossaryHeaders.map((header, index) => [header, row[index] ?? '']),
));
const entityTerms = Object.keys(en)
  .filter((key) => key.endsWith('.name') || key.endsWith('.label'))
  .map((key) => ({ key, source: en[key] }));
const dntTerms = glossaryTerms.filter((row) => row.do_not_translate === 'DNT').map((row) => row.term);
const ignoredDomains = new Set([
  'unit', 'building', 'tag', 'terrainTag', 'resource', 'population', 'difficulty',
  'stat', 'tech', 'techEffect', 'techFlag', 'spell', 'specialist', 'hint',
]);

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (['.ts', '.tsx', '.js', '.jsx', '.css'].includes(extname(entry.name))
      && !relative(root, path).startsWith('src/i18n/locales/')) files.push(path);
  }
  return files;
}

const codeFiles = await sourceFiles(resolve(root, 'src'));
const sourceText = (await Promise.all(codeFiles.map((path) => readFile(path, 'utf8')))).join('\n');
const hasWord = (message, term) => new RegExp(
  `(^|[^\\p{L}\\p{N}_])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}_])`,
  'iu',
).test(message);

for (const locale of locales) {
  const target = JSON.parse(await readFile(resolve(localeDirectory, `${locale}.json`), 'utf8'));
  console.log(`\n[${locale}] Terminology mismatches`);
  let mismatchCount = 0;
  for (const term of glossaryTerms) {
    if (!term.term || term.do_not_translate === 'DNT' || !term[locale]) continue;
    for (const [key, sourceMessage] of Object.entries(en)) {
      if (hasWord(sourceMessage, term.term) && !target[key]?.toLocaleLowerCase(locale).includes(term[locale].toLocaleLowerCase(locale))) {
        console.log(`${key}: expected “${term[locale]}” for “${term.term}”`);
        mismatchCount += 1;
      }
    }
  }
  for (const entity of entityTerms) {
    const translatedName = target[entity.key];
    if (!translatedName) continue;
    for (const [key, sourceMessage] of Object.entries(en)) {
      if (hasWord(sourceMessage, entity.source) && !target[key]?.toLocaleLowerCase(locale).includes(translatedName.toLocaleLowerCase(locale))) {
        console.log(`${key}: expected entity name “${translatedName}” from ${entity.key}`);
        mismatchCount += 1;
      }
    }
  }
  if (mismatchCount === 0) console.log('No possible terminology mismatches.');

  console.log(`[${locale}] Do-not-translate terms`);
  let dntCount = 0;
  for (const term of dntTerms) {
    for (const [key, sourceMessage] of Object.entries(en)) {
      if (hasWord(sourceMessage, term) && !target[key]?.toLocaleLowerCase(locale).includes(term.toLocaleLowerCase(locale))) {
        console.log(`${key}: missing “${term}”`);
        dntCount += 1;
      }
    }
  }
  if (dntCount === 0) console.log('No missing do-not-translate terms.');

  console.log(`[${locale}] Near maxLen`);
  let nearLimitCount = 0;
  for (const [key, entry] of Object.entries(context)) {
    const message = target[key];
    if (entry.maxLen && message && message.length >= entry.maxLen * 0.9) {
      console.log(`${key}: ${message.length}/${entry.maxLen}`);
      nearLimitCount += 1;
    }
  }
  if (nearLimitCount === 0) console.log('No values near maxLen.');

  console.log(`[${locale}] UI keys whose English literal is absent from src/`);
  let unusedCount = 0;
  for (const [key, message] of Object.entries(en)) {
    if (ignoredDomains.has(key.split('.')[0])) continue;
    const literal = message.replace(/\{[^{}]*\}/g, '').trim();
    if (literal && !sourceText.includes(literal)) {
      console.log(key);
      unusedCount += 1;
    }
  }
  if (unusedCount === 0) console.log('No candidate unused keys.');
}

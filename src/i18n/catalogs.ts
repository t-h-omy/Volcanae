import en from './locales/en.json';
import { SUPPORTED_LOCALES, type LocaleCode } from '../../config/i18n';

export type Catalog = { [key: string]: string };

type CatalogModule = { default: Catalog };
type CatalogLoader = () => Promise<CatalogModule>;

const loaders = import.meta.glob<CatalogModule>('./locales/*.json');
const localeLoaders = new Map<LocaleCode, CatalogLoader>();

for (const code of SUPPORTED_LOCALES) {
  if (code === 'en') continue;
  const path = `./locales/${code}.json`;
  const loader = loaders[path];
  if (loader) localeLoaders.set(code, loader);
}

const catalogs = new Map<LocaleCode, Catalog>([['en', en]]);
const pending = new Map<LocaleCode, Promise<Catalog>>();

export async function loadCatalog(code: LocaleCode): Promise<Catalog> {
  const loaded = catalogs.get(code);
  if (loaded) return loaded;
  const existing = pending.get(code);
  if (existing) return existing;
  const loader = localeLoaders.get(code);
  if (!loader) throw new Error(`No catalog loader for locale ${code}`);
  const request = loader().then(({ default: catalog }) => {
    catalogs.set(code, catalog);
    pending.delete(code);
    return catalog;
  }).catch((error: unknown) => {
    pending.delete(code);
    throw error;
  });
  pending.set(code, request);
  return request;
}

export function getCatalog(code: LocaleCode): Catalog | undefined {
  return catalogs.get(code);
}

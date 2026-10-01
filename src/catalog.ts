import { isLocale, locales, type Locale } from './i18n';

export interface GameText {
  name: string;
  description: string;
}

export interface Game {
  id: string;
  defaultLocale: Locale;
  text: Partial<Record<Locale, GameText>>;
  url: string;
  launchUrls: Partial<Record<Locale, string>>;
  cover: string | null;
  categories: string[];
  tags: string[];
  source: string;
}

export type CategoryNames = Record<Locale, string>;

export interface RequestRecord {
  url: string;
  status: number | null;
  ms: number;
  bytes: number;
}

export interface Catalog {
  base: URL;
  games: Game[];
  categories: Map<string, CategoryNames>;
  requests: RequestRecord[];
  loadedAt: Date;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

// Catalog data is third-party input: only HTTPS links may become hrefs or image sources.
function httpsUrl(value: unknown): string | null {
  const text = nonEmptyString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => nonEmptyString(item) !== null) : [];
}

async function fetchJson(url: URL, requests: RequestRecord[], signal: AbortSignal): Promise<unknown> {
  const started = performance.now();
  const record: RequestRecord = { url: url.href, status: null, ms: 0, bytes: 0 };
  requests.push(record);
  try {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    record.status = response.status;
    const body = await response.text();
    record.bytes = new TextEncoder().encode(body).byteLength;
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.href}`);
    return JSON.parse(body) as unknown;
  } finally {
    record.ms = Math.round(performance.now() - started);
  }
}

function parseCategories(data: unknown): Map<string, CategoryNames> {
  if (!isObject(data)) throw new Error('categories.json must be an object');
  const categories = new Map<string, CategoryNames>();
  for (const [key, value] of Object.entries(data)) {
    if (!isObject(value)) continue;
    const en = nonEmptyString(value.en);
    const zh = nonEmptyString(value['zh-TW']);
    const ja = nonEmptyString(value.ja);
    if (en && zh && ja) categories.set(key, { en, 'zh-TW': zh, ja });
  }
  return categories;
}

function parseGame(data: unknown, expectedId: string, source: string): Game | null {
  if (!isObject(data) || data.id !== expectedId || data.status !== 'published') return null;
  const url = httpsUrl(data.url);
  if (!url || !isObject(data.locales)) return null;

  const text: Partial<Record<Locale, GameText>> = {};
  for (const locale of locales) {
    const entry = data.locales[locale];
    if (!isObject(entry)) continue;
    const name = nonEmptyString(entry.name);
    const description = nonEmptyString(entry.description);
    if (name && description) text[locale] = { name, description };
  }

  const launchUrls: Partial<Record<Locale, string>> = {};
  if (isObject(data.launchUrls)) {
    for (const locale of locales) {
      const launchUrl = httpsUrl(data.launchUrls[locale]);
      if (launchUrl) launchUrls[locale] = launchUrl;
    }
  }

  const defaultLocale = isLocale(data.defaultLocale) ? data.defaultLocale : 'en';
  if (!text[defaultLocale] && !text.en) return null;

  return {
    id: expectedId,
    defaultLocale,
    text,
    url,
    launchUrls,
    cover: httpsUrl(data.cover),
    categories: stringList(data.categories),
    tags: stringList(data.tags),
    source,
  };
}

export async function loadCatalog(base: URL, signal: AbortSignal): Promise<Catalog> {
  const requests: RequestRecord[] = [];
  const [index, categoryData] = await Promise.all([
    fetchJson(new URL('allgames.json', base), requests, signal),
    fetchJson(new URL('categories.json', base), requests, signal),
  ]);
  if (!isObject(index) || !Array.isArray(index.games)) throw new Error('allgames.json has no games array');

  const references = index.games.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const id = nonEmptyString(entry.id);
    const path = nonEmptyString(entry.path);
    if (!id || !path) return [];
    const url = new URL(path, base);
    // Index paths must stay on the catalog origin; never follow them elsewhere.
    return url.origin === base.origin ? [{ id, url }] : [];
  });

  const results = await Promise.allSettled(
    references.map(async ({ id, url }) => parseGame(await fetchJson(url, requests, signal), id, url.pathname)),
  );
  if (signal.aborted) throw signal.reason;

  const games = results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
  return { base, games, categories: parseCategories(categoryData), requests, loadedAt: new Date() };
}

export function gameText(game: Game, locale: Locale): GameText {
  // parseGame guarantees that the default or English text exists.
  return (game.text[locale] ?? game.text[game.defaultLocale] ?? game.text.en)!;
}

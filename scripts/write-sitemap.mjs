// Writes dist/sitemap.xml: the static views plus one detail page per published game
// in the GameCatalog. If the catalog cannot be read, the build still succeeds with
// the static views only, so an offline build never ships a missing sitemap.
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const site = `https://${(await readFile(new URL('CNAME', root), 'utf8')).trim()}/`;
const catalog = new URL(process.env.VITE_CATALOG_BASE_URL || 'https://data.ysgs.app/');

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function publishedGameIds() {
  const index = await fetchJson(new URL('allgames.json', catalog));
  if (!Array.isArray(index?.games)) throw new Error('allgames.json has no games array');
  const ids = await Promise.all(
    index.games.map(async (entry) => {
      if (typeof entry?.id !== 'string' || typeof entry.path !== 'string') return null;
      const url = new URL(entry.path, catalog);
      if (url.origin !== catalog.origin) return null;
      const game = await fetchJson(url);
      return game?.id === entry.id && game.status === 'published' ? entry.id : null;
    }),
  );
  return ids.filter((id) => id !== null);
}

const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pages = ['', '?view=games', '?view=data'];
try {
  const ids = await publishedGameIds();
  pages.push(...ids.map((id) => `?view=games&id=${encodeURIComponent(id)}`));
  console.log(`sitemap: ${ids.length} game pages`);
} catch (error) {
  console.warn(`sitemap: catalog unavailable, static pages only (${error.message})`);
}

const body = pages.map((page) => `  <url>\n    <loc>${escapeXml(new URL(page, site).href)}</loc>\n  </url>`).join('\n');
await writeFile(new URL('dist/sitemap.xml', root), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);

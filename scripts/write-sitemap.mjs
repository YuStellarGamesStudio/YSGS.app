// Writes dist/sitemap.xml: the static views plus one detail page per published game
// in the GameCatalog. If the catalog cannot be read, the build still succeeds with
// the static views only, so an offline build never ships a missing sitemap.
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const site = `https://${(await readFile(new URL('CNAME', root), 'utf8')).trim()}/`;
const catalog = new URL(process.env.VITE_CATALOG_BASE_URL || 'https://data.ysgs.app/');

// data.ysgs.app sits behind Cloudflare, which answers 403 to GitHub-hosted runners, so the
// build falls back to the same files in the GameCatalog repository (public, same content).
const mirror = new URL('https://raw.githubusercontent.com/YuStellarGamesStudio/GameCatalog/main/');

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

// `path` is a catalog-absolute path such as /games/foo.json.
async function readCatalog(path) {
  const url = new URL(path, catalog);
  if (url.origin !== catalog.origin) throw new Error(`path leaves the catalog origin: ${path}`);
  try {
    return await fetchJson(url);
  } catch (primaryError) {
    if (process.env.VITE_CATALOG_BASE_URL) throw primaryError;
    console.warn(`sitemap: ${primaryError.message}; trying GitHub mirror`);
    return fetchJson(new URL(url.pathname.replace(/^\//, ''), mirror));
  }
}

async function publishedGames() {
  const index = await readCatalog('/allgames.json');
  if (!Array.isArray(index?.games)) throw new Error('allgames.json has no games array');
  const games = await Promise.all(
    index.games.map(async (entry) => {
      if (typeof entry?.id !== 'string' || typeof entry.path !== 'string') return null;
      const game = await readCatalog(entry.path);
      return game?.id === entry.id && game.status === 'published' ? game : null;
    }),
  );
  return games.filter((game) => game !== null);
}

// Only genres that are both defined in categories.json and used by a published game
// get a page, mirroring what the site's genre filter can actually show.
async function usedGenres(games) {
  const defined = await readCatalog('/categories.json');
  const used = new Set(games.flatMap((game) => (Array.isArray(game.categories) ? game.categories : [])));
  return Object.keys(defined).filter((key) => used.has(key));
}

const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pages = ['', '?view=games', '?view=data', '?view=privacy'];
try {
  const games = await publishedGames();
  const genres = await usedGenres(games);
  pages.push(...genres.map((key) => `?view=games&genre=${encodeURIComponent(key)}`));
  pages.push(...games.map((game) => `?view=games&id=${encodeURIComponent(game.id)}`));
  console.log(`sitemap: ${games.length} game pages, ${genres.length} genre pages`);
} catch (error) {
  console.warn(`sitemap: catalog unavailable, static pages only (${error.message})`);
}

const body = pages.map((page) => `  <url>\n    <loc>${escapeXml(new URL(page, site).href)}</loc>\n  </url>`).join('\n');
await writeFile(new URL('dist/sitemap.xml', root), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);

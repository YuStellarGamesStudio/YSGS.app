// Writes dist/sw.js from src/sw.js with the list of shell files to precache and a
// hash of their contents, so every deploy that changes the shell installs a new worker.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
// Not needed to run the app offline: crawler files, the share image and Pages config.
const skip = new Set(['CNAME', '.nojekyll', 'robots.txt', 'sitemap.xml', 'og-image.png', 'sw.js']);

const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => relative(fileURLToPath(dist), join(entry.parentPath, entry.name)).split(sep).join('/'))
  .filter((file) => !skip.has(file))
  .sort();

const hash = createHash('sha256');
for (const file of files) hash.update(file).update(await readFile(new URL(file, dist)));
const urls = files.map((file) => (file === 'index.html' ? '/' : `/${file}`));

const template = await readFile(new URL('src/sw.js', root), 'utf8');
if (!template.includes("'__VERSION__'") || !template.includes('__PRECACHE__')) throw new Error('src/sw.js is missing its build placeholders');
const source = template.replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12))).replace('__PRECACHE__', JSON.stringify(urls));
await writeFile(new URL('sw.js', dist), source);
console.log(`sw: ${urls.length} shell files`);

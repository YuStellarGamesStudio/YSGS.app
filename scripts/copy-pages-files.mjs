import { copyFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

await Promise.all(
  ['CNAME', '.nojekyll'].map((file) =>
    copyFile(new URL(file, root), new URL(`dist/${file}`, root)),
  ),
);

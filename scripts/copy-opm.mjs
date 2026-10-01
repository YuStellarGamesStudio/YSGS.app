import { cp, mkdir } from 'node:fs/promises';

// Keep OPM's ESM/worklet relative imports intact in both Vite dev and production.
// Generated public files are ignored; the vendored release is the source of truth.
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/opm/', root), { recursive: true });
await cp(new URL('vendor/xyz.js/dist/vendor/opm/', root), new URL('public/opm/', root), { recursive: true });

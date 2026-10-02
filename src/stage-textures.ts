import { Texture } from 'xyz.js';

/** Surface colour (sRGB, 0–1) at a point on the unit sphere. */
export type Painter = (x: number, y: number, z: number) => [number, number, number];

type RGB = [number, number, number];

function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Trilinear value noise in [0, 1]. Sampling in 3D keeps sphere maps seamless. */
function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const plane = (dz: number): number =>
    lerp(lerp(hash(xi, yi, zi + dz), hash(xi + 1, yi, zi + dz), u), lerp(hash(xi, yi + 1, zi + dz), hash(xi + 1, yi + 1, zi + dz), u), v);
  return lerp(plane(0), plane(1), w);
}

function fbm(x: number, y: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y, z) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
  }
  return sum / norm;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function band(stops: RGB[], t: number): RGB {
  const f = (((t % 1) + 1) % 1) * stops.length;
  const i = Math.floor(f);
  return mix(stops[i]!, stops[(i + 1) % stops.length]!, smooth(f - i));
}

/** Rasterises an equirectangular sphere map (u = longitude, v = latitude from the north pole). */
export function sphereTexture(paint: Painter, width: number, height = width / 2): Promise<Texture> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let j = 0; j < height; j++) {
    const lat = Math.PI * ((j + 0.5) / height);
    const y = Math.cos(lat);
    const ring = Math.sin(lat);
    for (let i = 0; i < width; i++) {
      const lon = Math.PI * 2 * ((i + 0.5) / width);
      const c = paint(Math.cos(lon) * ring, y, Math.sin(lon) * ring);
      const o = (j * width + i) * 4;
      data[o] = c[0] * 255;
      data[o + 1] = c[1] * 255;
      data[o + 2] = c[2] * 255;
      data[o + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return Texture.fromImage(canvas);
}

/** Square planetary-ring map for a flat plane: transparent outside the band. */
export function ringTexture(size = 128): Promise<Texture> {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  const image = context.createImageData(size, size);
  const data = image.data;
  const inner = 0.56;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
      const o = (j * size + i) * 4;
      if (d < inner || d > 0.98) continue;
      const t = (d - inner) / (0.98 - inner);
      // Dense ringlets, a Cassini-like gap two thirds out and soft edges.
      const ringlets = 0.55 + 0.45 * fbm(t * 40, 0.5, 0.5, 3);
      const gap = 1 - 0.85 * Math.exp(-(((t - 0.68) / 0.03) ** 2));
      const edge = Math.min(1, t / 0.08, (1 - t) / 0.05);
      const c = mix([0.62, 0.55, 0.45], [0.88, 0.82, 0.7], ringlets);
      data[o] = c[0] * 255;
      data[o + 1] = c[1] * 255;
      data[o + 2] = c[2] * 255;
      data[o + 3] = ringlets * gap * edge * 0.85 * 255;
    }
  }
  context.putImageData(image, 0, 0);
  return Texture.fromImage(canvas);
}

/** Soft radial falloff for a camera-facing corona; `limb` is the star's edge as a fraction of the radius. */
export function coronaTexture(limb: number, size = 256): Promise<Texture> {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgb(255 255 255 / 1)');
  gradient.addColorStop(limb, 'rgb(255 255 255 / 0.6)');
  gradient.addColorStop(limb + (1 - limb) * 0.2, 'rgb(255 255 255 / 0.2)');
  gradient.addColorStop(limb + (1 - limb) * 0.55, 'rgb(255 255 255 / 0.05)');
  gradient.addColorStop(1, 'rgb(255 255 255 / 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.fromImage(canvas);
}

/** HUD target-lock reticle: four bright corner brackets around a faint dashed ring; white, tinted by the material. */
export function bracketTexture(size = 128): Promise<Texture> {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  const half = size / 2;
  const inset = size * 0.08;
  const reach = size * 0.22;
  context.strokeStyle = '#fff';
  context.lineWidth = size * 0.045;
  context.lineCap = 'square';
  for (const [x, y] of [[inset, inset], [size - inset, inset], [inset, size - inset], [size - inset, size - inset]] as const) {
    const dx = x < half ? reach : -reach;
    const dy = y < half ? reach : -reach;
    context.beginPath();
    context.moveTo(x + dx, y);
    context.lineTo(x, y);
    context.lineTo(x, y + dy);
    context.stroke();
  }
  context.globalAlpha = 0.45;
  context.lineWidth = size * 0.018;
  context.setLineDash([size * 0.035, size * 0.05]);
  context.beginPath();
  context.arc(half, half, size * 0.3, 0, Math.PI * 2);
  context.stroke();
  return Texture.fromImage(canvas);
}

/** Soft gas cloud for a camera-facing nebula: white with a noisy, radially fading alpha, tinted by the material. */
export function nebulaTexture(seed: number, size = 256): Promise<Texture> {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  const image = context.createImageData(size, size);
  const data = image.data;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size - 0.5;
      const y = (j + 0.5) / size - 0.5;
      const falloff = Math.max(0, 1 - Math.hypot(x, y) * 2) ** 1.5;
      // Domain-warped noise gives the wispy filaments of a real emission nebula.
      const warp = fbm(x * 3 + seed, y * 3, seed * 0.5, 3);
      const cloud = fbm(x * 5 + warp * 2.2, y * 5 + warp * 2.2, seed, 5);
      const o = (j * size + i) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.min(1, Math.max(0, (cloud - 0.38) * 2.6) * falloff) * 255;
    }
  }
  context.putImageData(image, 0, 0);
  return Texture.fromImage(canvas);
}

/** Tileable spacecraft plating: staggered panels in close greys, fine seams, the odd thermal tile and hatch. */
export function hullTexture(size = 256): Promise<Texture> {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  const cells = 4;
  const cell = size / cells;
  for (let row = 0; row < cells; row++) {
    // Panels never cross the tile edge, so the map repeats without seams.
    for (let col = 0; col < cells; ) {
      const span = Math.min(cells - col, 1 + Math.floor(hash(row, col, 7) * 3));
      const x = col * cell;
      const y = row * cell;
      const width = span * cell;
      const shade = hash(row, col, 13) > 0.92 ? 0.42 : 0.74 + hash(row, col, 11) * 0.12;
      context.fillStyle = `rgb(${shade * 255} ${shade * 253} ${shade * 248})`;
      context.fillRect(x, y, width, cell);
      if (hash(row, col, 3) > 0.75) {
        context.strokeStyle = 'rgb(120 124 132)';
        context.lineWidth = 1;
        context.strokeRect(x + cell * 0.3, y + cell * 0.3, Math.min(width, cell) * 0.4, cell * 0.4);
      }
      context.fillStyle = 'rgb(88 92 102)';
      context.fillRect(x, y, width, 1);
      context.fillRect(x, y, 1, cell);
      col += span;
    }
  }
  // Fine grime so large panels do not read as flat fills. Blending four shifted copies of the
  // noise by position makes it wrap at the tile edges.
  const image = context.getImageData(0, 0, size, size);
  const data = image.data;
  const grimeAt = (u: number, v: number): number => fbm(u * 16, v * 16, 3.1, 3);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      const tiled = grimeAt(u, v) * (1 - u) * (1 - v) + grimeAt(u - 1, v) * u * (1 - v) + grimeAt(u, v - 1) * (1 - u) * v + grimeAt(u - 1, v - 1) * u * v;
      const grime = 0.94 + tiled * 0.12;
      const o = (j * size + i) * 4;
      data[o] = Math.min(255, data[o]! * grime);
      data[o + 1] = Math.min(255, data[o + 1]! * grime);
      data[o + 2] = Math.min(255, data[o + 2]! * grime);
    }
  }
  context.putImageData(image, 0, 0);
  return Texture.fromImage(canvas);
}

/** Radiator panel: coolant channels running along the panel inside a darker frame. */
export function radiatorTexture(size = 128): Promise<Texture> {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  context.fillStyle = 'rgb(200 200 200)';
  context.fillRect(0, 0, size, size);
  context.fillStyle = 'rgb(245 245 245)';
  for (let x = 4; x < size - 4; x += 8) context.fillRect(x, 0, 3, size);
  context.strokeStyle = 'rgb(130 130 130)';
  context.lineWidth = 4;
  context.strokeRect(2, 2, size - 4, size - 4);
  return Texture.fromImage(canvas);
}

/** Faint photosphere granulation; tinted by the material's emissive factor. */
export const paintStar: Painter = (x, y, z) => {
  const v = 0.86 + fbm(x * 14, y * 14, z * 14, 3) * 0.14;
  return [v, v, v];
};

export const paintRocky: Painter = (x, y, z) => {
  const base = fbm(x * 3, y * 3, z * 3);
  const craters = Math.abs(fbm(x * 9 + 3, y * 9, z * 9, 3) - 0.5) * 2;
  return mix([0.25, 0.24, 0.23], [0.62, 0.6, 0.57], base * 0.7 + craters * 0.5);
};

export const paintCloudy: Painter = (x, y, z) => {
  const swirl = fbm(x * 2 + fbm(x * 4, y * 4, z * 4) * 1.5, y * 6, z * 2);
  return mix([0.78, 0.68, 0.48], [0.96, 0.9, 0.74], swirl);
};

export const paintOcean: Painter = (x, y, z) => {
  const land = fbm(x * 2.2 + 11, y * 2.2, z * 2.2);
  const lat = Math.abs(y);
  let c: RGB = land > 0.53 ? mix([0.24, 0.4, 0.18], [0.55, 0.47, 0.3], (land - 0.53) * 6 + lat * 0.6) : mix([0.03, 0.1, 0.3], [0.06, 0.22, 0.45], land * 1.6);
  if (lat > 0.86 + (land - 0.5) * 0.2) c = [0.92, 0.95, 0.98];
  const clouds = fbm(x * 4 + 5, y * 8, z * 4, 5);
  return mix(c, [1, 1, 1], (clouds - 0.5) * 3);
};

export const paintRust: Painter = (x, y, z) => {
  const terrain = fbm(x * 3 + 4, y * 3, z * 3);
  const c = mix([0.42, 0.18, 0.09], [0.78, 0.45, 0.27], terrain);
  return Math.abs(y) > 0.92 ? mix(c, [0.95, 0.93, 0.9], (Math.abs(y) - 0.92) * 25) : c;
};

const giantBands = (stops: RGB[], turbulence: number): Painter => (x, y, z) => {
  const warp = fbm(x * 3, y * 3, z * 3) * turbulence;
  let c = band(stops, y * 3.2 + warp);
  // A single long-lived storm in the southern belt.
  const storm = Math.exp(-(((y + 0.35) / 0.07) ** 2 + ((x - 0.85) / 0.16) ** 2 + (z / 0.16) ** 2));
  c = mix(c, [0.72, 0.36, 0.24], storm * 0.9);
  return c;
};

export const paintGiant = giantBands(
  [
    [0.85, 0.76, 0.62],
    [0.66, 0.5, 0.36],
    [0.92, 0.86, 0.74],
    [0.58, 0.42, 0.3],
    [0.8, 0.66, 0.5],
  ],
  0.9,
);

export const paintRinged = giantBands(
  [
    [0.9, 0.82, 0.62],
    [0.8, 0.7, 0.5],
    [0.94, 0.88, 0.7],
    [0.84, 0.75, 0.56],
  ],
  0.35,
);

export const paintIce: Painter = (x, y, z) => {
  const haze = fbm(x * 2, y * 9, z * 2, 3);
  return mix([0.42, 0.7, 0.8], [0.62, 0.86, 0.92], haze * 0.8 + Math.abs(y) * 0.3);
};

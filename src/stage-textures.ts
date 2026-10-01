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

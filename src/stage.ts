import { Billboard, EnvironmentMap, Game, Geometry, Group, InstancedMesh, Line3D, Matrix4, Mesh, PBRMaterial, PerspectiveCamera, PointLight, Quaternion, Scene, Texture, Vector3 } from 'xyz.js';
import type { PBRMaterialOptions } from 'xyz.js';
import type { Painter } from './stage-textures';
import { coronaTexture, nebulaTexture, paintCloudy, paintGiant, paintIce, paintOcean, paintRinged, paintRocky, paintRust, paintStar, ringTexture, sphereTexture } from './stage-textures';

export type StageTheme = 'dark' | 'light';
export type StageView = 'home' | 'games' | 'game' | 'data' | 'missing';
export interface StageData {
  /** Published game count; one satellite orbits the core per game. */
  games: number;
  /** Games per genre in use, largest first; drawn as the data-view towers. */
  genres: number[];
}
export interface StageState {
  theme: StageTheme;
  view: StageView;
  data: StageData;
  motion: boolean;
  /** Render nothing at all, e.g. while a game covers the page. */
  paused: boolean;
  /** Hold the current frame and draw only after a change, as under reduced motion,
   *  e.g. while the window is visible but unfocused. */
  idle: boolean;
}
export interface Stage {
  update(state: StageState): void;
  setPointer(x: number, y: number): void;
}

type RGB = [number, number, number];
type Vec3 = [number, number, number];
interface Palette {
  zenith: RGB;
  horizon: RGB;
  ground: RGB;
  fog: RGB;
  fogDensity: number;
  /** Light skies need visible surface colour; dark skies rely on emission alone. */
  tintedSurfaces: boolean;
  base: RGB;
  grid: RGB;
  cyan: RGB;
  magenta: RGB;
  /** Central star; emissive, so values above 1 bloom. */
  primary: RGB;
  /** Emissive tints of the two nebula clouds, and their opacity. */
  nebulaA: RGB;
  nebulaB: RGB;
  nebulaOpacity: number;
  /** Unlit halo tint around the star. */
  corona: RGB;
  orbit: RGB;
  orbitOpacity: number;
  /** Point-light intensity of the central star; the only light that should reach the planets. */
  starLight: number;
  star: RGB;
  ambient: number;
  sun: number;
  bloom: number;
}

// Emissive values above 1 feed the HDR bloom pass; the light palette stays low so
// glow does not wash out the pale sky.
const PALETTES: Record<StageTheme, Palette> = {
  dark: {
    zenith: [0.002, 0.004, 0.016],
    horizon: [0.012, 0.035, 0.075],
    ground: [0.002, 0.003, 0.008],
    fog: [0.012, 0.03, 0.06],
    fogDensity: 0.032,
    tintedSurfaces: false,
    base: [0.02, 0.03, 0.05],
    grid: [0.02, 0.3, 0.42],
    cyan: [0.1, 2.6, 3.4],
    magenta: [3.2, 0.25, 1.9],
    nebulaA: [2.2, 0.3, 1.7],
    nebulaB: [0.2, 1.2, 2.4],
    nebulaOpacity: 0.75,
    primary: [3.4, 3.8, 4.6],
    corona: [1, 1.4, 2.1],
    orbit: [0.3, 0.45, 0.65],
    orbitOpacity: 0.3,
    starLight: 14,
    star: [1.6, 1.9, 2.4],
    ambient: 0.15,
    // Kept dim so the planets' night sides stay dark; the star's point light does the work.
    sun: 0.15,
    bloom: 0.9,
  },
  light: {
    zenith: [0.5, 0.64, 0.88],
    horizon: [0.86, 0.9, 0.97],
    ground: [0.8, 0.84, 0.92],
    fog: [0.86, 0.9, 0.97],
    fogDensity: 0.018,
    tintedSurfaces: true,
    base: [0.75, 0.8, 0.88],
    grid: [0.2, 0.36, 0.48],
    cyan: [0, 0.55, 0.8],
    magenta: [0.75, 0.05, 0.45],
    nebulaA: [0.85, 0.45, 0.8],
    nebulaB: [0.4, 0.7, 1],
    nebulaOpacity: 0.28,
    primary: [1.6, 1.8, 2.2],
    corona: [1, 0.97, 0.9],
    orbit: [0.05, 0.2, 0.36],
    orbitOpacity: 0.55,
    starLight: 10,
    star: [0.1, 0.18, 0.4],
    ambient: 0.6,
    sun: 1.4,
    bloom: 0.25,
  },
};

interface Shot {
  position: Vec3;
  target: Vec3;
  /** Floor fade as [start, end] world z: full strength nearer than start, gone past end.
   *  Views that show the planetary system end the floor in front of it, so grid lines
   *  never run behind its orbits and planets. */
  floor: [number, number];
}

// Camera framing per route. The core sits right of centre so the home hero copy keeps the left.
const SHOTS: Record<StageView, Shot> = {
  home: { position: [0, 1.6, 10], target: [0, 0.9, 0], floor: [7, -6] },
  games: { position: [-3, 5.5, 14], target: [1, 0.2, -4], floor: [7, -2] },
  // Detail pages are text-dense on both sides, so look away from the core toward open sky.
  game: { position: [-6, 4, 10], target: [-10, 2.5, -14], floor: [-16, -44] },
  // The data towers stand at z ≈ -20, so this view keeps the far floor.
  data: { position: [-7, 2, 8], target: [-5, -1.5, -18], floor: [-16, -44] },
  missing: { position: [0, 9, 12], target: [0, 0, -2], floor: [9, 2] },
};

const CORE: Vec3 = [3.6, 1.6, 0];
// Portrait screens stack the hero copy under the visual, so centre the core and lift it.
const PORTRAIT_SHOTS: Partial<Record<StageView, Shot>> = {
  home: { position: [CORE[0], 3.2, 14], target: [CORE[0], -0.6, 0], floor: [8, -2] },
};
const FLOOR_Y = -1.2;
const GRID_HALF_WIDTH = 30;
const GRID_STEP = 2;
const GRID_LINE_WIDTH = 0.025;
const GRID_LINE_HEIGHT = 0.01;
// Floor depth range (world z). The near edge stays below every camera's view.
const GRID_NEAR = 10;
const GRID_FAR = -46;
// Spacing of the alpha samples along the z lines, which sets how smooth the fade is.
const GRID_SAMPLE_STEP = 1;
const STAR_COUNT = 700;
const TOWER_SLOTS = 16;
// Nebulae sit well behind the stars; fog thins them, so they are drawn large and bright.
const NEBULAE: Array<{ position: Vec3; size: number; tint: 'nebulaA' | 'nebulaB' }> = [
  { position: [-6, 9, -34], size: 40, tint: 'nebulaA' },
  { position: [20, 6, -36], size: 46, tint: 'nebulaB' },
  { position: [-26, 6, -10], size: 34, tint: 'nebulaB' },
];
// Scanner reticle around the star: a tick ring just outside the corona, and three bright arcs inside it.
const SCANNER_RADIUS = 0.82;
const SCANNER_TICKS = 120;
// Asteroid belt between the rocky inner worlds and the giants.
const BELT_ROCKS = 220;
const BELT_WIDTH = 0.16;
// Capital ship drifting past in the middle distance, as [x, y, z].
const SHIP: Vec3 = [1.5, 5.2, -18];
const SHIP_LENGTH = 7;
const SHIP_WINDOW_COLUMNS = 28;
// Ambient motion reads fine at 24 fps; the display rate would more than double GPU work.
const FRAME_INTERVAL_MS = 1000 / 24;
// How long a still (reduced-motion) stage keeps rendering after a change.
const WAKE_MS = 600;

// One planet per published game, innermost first like a real system: rocky worlds,
// then giants. Kinds repeat if there are more games than entries.
// `map` is the surface texture width; planets cover a few dozen pixels at most, so only
// the giants get the larger map.
const PLANETS: Array<{ paint: Painter; map: number; radius: number; roughness: number; axialTilt: number; ring?: boolean }> = [
  { paint: paintRocky, map: 128, radius: 0.06, roughness: 0.95, axialTilt: 0.05 },
  { paint: paintCloudy, map: 128, radius: 0.09, roughness: 0.9, axialTilt: 0.12 },
  { paint: paintOcean, map: 128, radius: 0.095, roughness: 0.55, axialTilt: 0.41 },
  { paint: paintRust, map: 128, radius: 0.075, roughness: 0.95, axialTilt: 0.44 },
  { paint: paintGiant, map: 256, radius: 0.2, roughness: 0.8, axialTilt: 0.05 },
  { paint: paintRinged, map: 256, radius: 0.17, roughness: 0.8, axialTilt: 0.47, ring: true },
  { paint: paintIce, map: 128, radius: 0.13, roughness: 0.7, axialTilt: 0.5 },
];
const STAR_RADIUS = 0.42;
/** Corona radius in star radii. */
const CORONA_SCALE = 2.8;
const ORBIT_INNER = 1.05;
const ORBIT_OUTER = 3.2;
// Kepler's third law: angular speed falls off as r^-1.5, so inner worlds race ahead.
const KEPLER = 0.75;
// Fading wake behind each planet as [start, end] angles (radians behind it) per opacity step.
const TRAIL: Array<{ from: number; to: number; opacity: number }> = [
  { from: 0.12, to: 0, opacity: 1.6 },
  { from: 0.35, to: 0.12, opacity: 0.9 },
  { from: 0.75, to: 0.35, opacity: 0.45 },
];

export interface StageTextures {
  white: Texture;
  star: Texture;
  ring: Texture;
  corona: Texture;
  nebulae: Texture[];
  planets: Texture[];
}

function scaled(color: RGB, factor: number): RGB {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circle(radius: number, segments: number): Vec3[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
  });
}

function arc(radius: number, from: number, to: number, segments: number): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / segments;
    return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
  });
}

function floorAlpha(z: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (z - end) / (start - end)));
  return t * t * (3 - 2 * t);
}

interface FloorLine {
  /** Floor-plane (x, z) points along the line. */
  points: Array<[number, number]>;
  /** Unit floor-plane direction across the line. */
  across: [number, number];
}

// Each line point yields four vertices: the top strip's two edges, then the bottom and top
// of a vertical fin. Without the fin, far lines seen at grazing angles thin below a pixel
// and break into dashes.
const FLOOR_VERTS_PER_POINT = 4;
// Geometry vertices are 8 floats: position, normal, uv.
const FLOATS_PER_VERTEX = 8;
// z offsets of a cross line's per-point vertices, matching floorLines' layout.
const CROSS_Z_OFFSETS = [-GRID_LINE_WIDTH / 2, GRID_LINE_WIDTH / 2, 0, 0];

/** Floor grid lines with RGBA vertex colours, whose alpha fades their emission too. */
function floorLines(lines: FloorLine[]): Geometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const half = GRID_LINE_WIDTH / 2;
  const rise = GRID_LINE_HEIGHT / 2;
  for (const { points, across } of lines) {
    const [ax, az] = across;
    points.forEach(([x, z], k) => {
      const first = positions.length / 3;
      positions.push(x - ax * half, rise, z - az * half, x + ax * half, rise, z + az * half, x, -rise, z, x, rise, z);
      normals.push(0, 1, 0, 0, 1, 0, ax, 0, az, ax, 0, az);
      uvs.push(0, 0, 0, 0, 0, 0, 0, 0);
      for (let v = 0; v < FLOOR_VERTS_PER_POINT; v++) colors.push(1, 1, 1, 1);
      if (k > 0) {
        const prev = first - FLOOR_VERTS_PER_POINT;
        indices.push(prev, prev + 1, first + 1, prev, first + 1, first, prev + 2, prev + 3, first + 3, prev + 2, first + 3, first + 2);
      }
    });
  }
  return new Geometry({ positions, normals, uvs, indices, colors });
}

class StageScene extends Scene {
  private readonly motion: boolean;
  private readonly pointerTarget = { x: 0, y: 0 };
  private readonly pointer = { x: 0, y: 0 };
  private readonly look = new Vector3();
  private readonly camGoal = new Vector3();
  private readonly lookGoal = new Vector3();
  private readonly alongLines: Geometry;
  private readonly crossLines: Geometry;
  /** Current floor fade [start, end]; eases toward the shot's, like the camera. */
  private readonly floorFade: [number, number] = [0, 0];
  /** Fade last written into alongLines, whose alpha only changes with the fade. */
  private readonly alongFade: [number, number] = [Number.NaN, Number.NaN];
  private readonly stars: Group;
  private readonly core: Mesh;
  private readonly planets: Array<{ holder: Group; body: Mesh; trail: Group; radius: number; speed: number; phase: number; spin: number }> = [];
  private readonly towers: InstancedMesh;
  private readonly scanner: Group;
  private belt: Group | null = null;
  private beltSpeed = 0;
  private readonly ship: Group;
  private readonly towerHeights: number[];
  // Scratch values reused every frame to avoid per-frame allocation.
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly size = new Vector3();
  private time = 0;
  private lastTick = 0;
  private towerGrowth = 0;
  private view: StageView;

  constructor(textures: StageTextures, state: StageState, previous?: StageScene) {
    super();
    const p = PALETTES[state.theme];
    const { white } = textures;
    this.motion = state.motion;
    this.view = state.view;
    const glow = (emissive: RGB, opacity = 1, extra: Partial<PBRMaterialOptions> = {}): PBRMaterial => {
      const peak = Math.max(...emissive, 1e-6);
      const color: RGB = p.tintedSurfaces ? [(emissive[0] / peak) * 0.8, (emissive[1] / peak) * 0.8, (emissive[2] / peak) * 0.8] : p.base;
      return new PBRMaterial({ texture: white, color, emissive, roughness: 0.6, ...(opacity < 1 ? { opacity, transparent: true, alphaMode: 'BLEND' as const } : {}), ...extra });
    };

    this.ambientLight = p.ambient;
    this.directionalLight.intensity = p.sun;
    this.directionalLight.direction.set(-0.4, 1, 0.6).normalize();
    this.pointLights.push(new PointLight({ position: new Vector3(...CORE), color: [0.88, 0.94, 1], intensity: p.starLight, range: 16 }));
    this.fog.enabled = true;
    this.fog.mode = 'exp2';
    this.fog.color = p.fog;
    this.fog.density = p.fogDensity;
    this.postProcessing.enabled = true;
    this.postProcessing.bloomStrength = p.bloom;
    this.postProcessing.bloomThreshold = 1;
    this.postProcessing.bloomRadius = 3;
    this.postProcessing.fxaa = true;
    // Sorted transparency writes depth, so the corona quad punched holes in the orbits behind it.
    this.transparency = 'weighted';
    this.background = EnvironmentMap.gradient({ zenith: p.zenith, horizon: p.horizon, ground: p.ground, width: 128 });
    const camera = new PerspectiveCamera();
    camera.fov = (55 * Math.PI) / 180;
    camera.far = 200;
    this.camera3D = camera;

    const { matrix: m, position: pos, rotation: rot, size } = this;

    // Holographic floor grid. Only the cross lines scroll toward the camera: moving the
    // lines along z over themselves would be invisible.
    const floor = this.add(new Group());
    floor.position.y = FLOOR_Y;
    const gridMaterial = glow(p.grid, 1, { transparent: true, alphaMode: 'BLEND', doubleSided: true });
    const depths = Array.from({ length: (GRID_NEAR - GRID_FAR) / GRID_SAMPLE_STEP + 1 }, (_, i) => GRID_NEAR - i * GRID_SAMPLE_STEP);
    const along = Array.from({ length: (2 * GRID_HALF_WIDTH) / GRID_STEP + 1 }, (_, i): FloorLine => {
      const x = -GRID_HALF_WIDTH + i * GRID_STEP;
      return { points: depths.map((z) => [x, z]), across: [1, 0] };
    });
    this.alongLines = floorLines(along);
    floor.add(new Mesh({ geometry: this.alongLines, material: gridMaterial }));
    // Cross line depth and every line's alpha are written by layoutFloor.
    const cross = Array.from({ length: (GRID_NEAR - GRID_FAR) / GRID_STEP }, (): FloorLine => ({ points: [[-GRID_HALF_WIDTH, 0], [GRID_HALF_WIDTH, 0]], across: [0, 1] }));
    this.crossLines = floorLines(cross);
    floor.add(new Mesh({ geometry: this.crossLines, material: gridMaterial }));

    // Starfield dome, seeded so theme/data rebuilds do not reshuffle it.
    this.stars = this.add(new Group());
    const starMesh = this.stars.add(new InstancedMesh({ geometry: Geometry.sphere(1, 6, 4), material: glow(p.star), count: STAR_COUNT }));
    const random = mulberry32(0x5953);
    const tints: RGB[] = [[1, 1, 1], [0.5, 1, 1], [1, 0.5, 0.95], [0.85, 1, 0.5]];
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = random();
      const a = random() * Math.PI * 2;
      const r = 22 + random() * 28;
      const s = Math.sqrt(1 - u * u);
      const radius = 0.03 + random() ** 4 * 0.12;
      starMesh.setMatrixAt(i, m.compose(pos.set(Math.cos(a) * s * r, u * r * 0.8 + 2, Math.sin(a) * s * r), rot, size.set(radius, radius, radius)));
      const tint = tints[Math.floor(random() * tints.length)]!;
      starMesh.setColorAt(i, tint[0], tint[1], tint[2]);
    }

    // Planetary system: a blue-white star lighting one planet per published game.
    // Planets are lit only by the star's point light, so they show real phases.
    const system = this.add(new Group());
    system.position.set(...CORE);
    system.rotation.setFromEuler(0.38, 0, -0.16);
    this.core = system.add(
      new Mesh({
        geometry: Geometry.sphere(STAR_RADIUS, 48, 24),
        material: new PBRMaterial({ texture: white, color: [0, 0, 0], emissive: p.primary, emissiveTexture: textures.star, roughness: 1 }),
      }),
    );
    // Bloom alone leaves a hard disc, so a soft camera-facing corona sits at the star. It is
    // an emissive PBR billboard (Sprite3D output is too dim to read as light) and lives in the
    // scene root because billboards ignore parent rotation.
    const coronaSize = STAR_RADIUS * CORONA_SCALE * 2;
    this.add(
      new Billboard({
        material: new PBRMaterial({ texture: textures.corona, color: [0, 0, 0], emissive: p.corona, emissiveTexture: textures.corona, transparent: true, alphaMode: 'BLEND' }),
        width: coronaSize,
        height: coronaSize,
        position: CORE,
      }),
    );
    const orbitMaterial = glow(p.orbit, p.orbitOpacity);
    const trailMaterials = TRAIL.map((step) => glow(scaled(p.orbit, step.opacity), Math.min(1, p.orbitOpacity * step.opacity * 1.4)));
    const ringMaterial = new PBRMaterial({ texture: textures.ring, roughness: 0.9, transparent: true, alphaMode: 'BLEND', doubleSided: true });
    const orbitRandom = mulberry32(0x0b17);
    const count = state.data.games;
    for (let i = 0; i < count; i++) {
      const kind = PLANETS[i % PLANETS.length]!;
      const radius = count > 1 ? ORBIT_INNER + ((ORBIT_OUTER - ORBIT_INNER) * i) / (count - 1) : (ORBIT_INNER + ORBIT_OUTER) / 2;
      // Real orbits are nearly coplanar: a few degrees of inclination at most.
      const plane = system.add(new Group());
      plane.rotation.setFromEuler((orbitRandom() - 0.5) * 0.08, 0, (orbitRandom() - 0.5) * 0.08);
      // Sub-pixel ribbons break into dashes, so orbits stay about a pixel wide and dim instead.
      plane.add(new Line3D(circle(radius, 160), { material: orbitMaterial, width: 0.014, closed: true }));
      const trail = plane.add(new Group());
      TRAIL.forEach((step, s) => trail.add(new Line3D(arc(radius, -step.from, -step.to, 12), { material: trailMaterials[s]!, width: 0.02 })));
      // The holder keeps the spin axis fixed in space while the planet travels.
      const holder = plane.add(new Group());
      holder.rotation.setFromEuler(kind.axialTilt, orbitRandom() * Math.PI, 0);
      const body = holder.add(
        new Mesh({ geometry: Geometry.sphere(kind.radius, 32, 16), material: new PBRMaterial({ texture: textures.planets[i % PLANETS.length]!, roughness: kind.roughness }) }),
      );
      if (kind.ring) holder.add(new Mesh({ geometry: Geometry.plane(kind.radius * 4.7, kind.radius * 4.7), material: ringMaterial }));
      this.planets.push({ holder, body, trail, radius, speed: KEPLER * radius ** -1.5, phase: i * 2.399, spin: 0.4 + orbitRandom() * 0.6 });
    }

    // HUD scanner locked onto the star: a ring of ticks counter-rotating under three bright arcs.
    this.scanner = system.add(new Group());
    const ticks = this.scanner.add(new InstancedMesh({ geometry: Geometry.cube(1), material: glow(scaled(p.cyan, 0.7), 0.9), count: SCANNER_TICKS }));
    for (let i = 0; i < SCANNER_TICKS; i++) {
      const a = (i / SCANNER_TICKS) * Math.PI * 2;
      const length = i % 10 === 0 ? 0.16 : 0.06;
      ticks.setMatrixAt(i, m.compose(pos.set(Math.cos(a) * (SCANNER_RADIUS + length / 2), 0, Math.sin(a) * (SCANNER_RADIUS + length / 2)), rot.setFromEuler(0, -a, 0), size.set(length, 0.012, 0.012)));
    }
    const scannerArcs: Array<[number, number, RGB]> = [
      [0.2, 1.3, p.cyan],
      [2.3, 3.0, p.magenta],
      [4.1, 5.4, p.cyan],
    ];
    for (const [from, to, color] of scannerArcs) this.scanner.add(new Line3D(arc(SCANNER_RADIUS - 0.07, from, to, 24), { material: glow(color), width: 0.03 }));

    // Asteroid belt in the gap between the rocky worlds and the giants.
    if (count > 4) {
      const radius = ORBIT_INNER + ((ORBIT_OUTER - ORBIT_INNER) * 3.5) / (count - 1);
      this.beltSpeed = KEPLER * radius ** -1.5;
      this.belt = system.add(new Group());
      const rocks = this.belt.add(new InstancedMesh({ geometry: Geometry.cube(1), material: new PBRMaterial({ texture: white, color: [0.55, 0.5, 0.45], roughness: 1 }), count: BELT_ROCKS }));
      const beltRandom = mulberry32(0xa57e);
      for (let i = 0; i < BELT_ROCKS; i++) {
        const a = beltRandom() * Math.PI * 2;
        const r = radius + (beltRandom() - 0.5) * BELT_WIDTH;
        const rock = 0.01 + beltRandom() ** 3 * 0.03;
        rocks.setMatrixAt(i, m.compose(pos.set(Math.cos(a) * r, (beltRandom() - 0.5) * 0.03, Math.sin(a) * r), rot.setFromEuler(beltRandom() * 3, beltRandom() * 3, 0), size.set(rock, rock * (0.6 + beltRandom() * 0.6), rock)));
      }
    }

    // Nebulae: huge soft gas clouds far behind the stars, tinted by the palette.
    NEBULAE.forEach((nebula, i) => {
      this.add(
        new Billboard({
          material: new PBRMaterial({ texture: textures.nebulae[i]!, color: [0, 0, 0], emissive: p[nebula.tint], emissiveTexture: textures.nebulae[i]!, opacity: p.nebulaOpacity, transparent: true, alphaMode: 'BLEND' }),
          width: nebula.size,
          height: nebula.size,
          position: nebula.position,
        }),
      );
    });

    // A capital ship drifting through the middle distance: dark hull, lit windows, engine glow.
    this.ship = this.add(new Group());
    this.ship.position.set(...SHIP);
    this.ship.rotation.setFromEuler(0, 0.35, 0);
    const hull = new PBRMaterial({ texture: white, color: p.tintedSurfaces ? [0.32, 0.38, 0.5] : [0.16, 0.2, 0.28], roughness: 0.45 });
    const half = SHIP_LENGTH / 2;
    const hullParts: Array<{ position: Vec3; scale: Vec3 }> = [
      { position: [0, 0, 0], scale: [SHIP_LENGTH, 0.7, 1.4] },
      { position: [-half * 0.45, 0.6, 0], scale: [1.6, 0.5, 0.8] },
      { position: [half * 0.2, -0.45, 0], scale: [SHIP_LENGTH * 0.5, 0.25, 1] },
      { position: [half + 0.35, 0.1, 0.55], scale: [0.9, 0.4, 0.4] },
      { position: [half + 0.35, 0.1, -0.55], scale: [0.9, 0.4, 0.4] },
    ];
    for (const part of hullParts) this.ship.add(new Mesh({ geometry: Geometry.cube(1), material: hull, position: part.position, scale: part.scale }));
    const engineMaterial = glow(p.cyan);
    for (const z of [0.55, -0.55]) this.ship.add(new Mesh({ geometry: Geometry.cube(1), material: engineMaterial, position: [half + 0.85, 0.1, z], scale: [0.12, 0.28, 0.28] }));
    this.ship.add(new Mesh({ geometry: Geometry.sphere(0.07, 8, 6), material: glow(p.magenta), position: [-half * 0.45, 1.0, 0] }));
    const windows = this.ship.add(new InstancedMesh({ geometry: Geometry.cube(1), material: glow([2.4, 1.9, 1.1]), count: SHIP_WINDOW_COLUMNS * 2 }));
    const windowRandom = mulberry32(0x5417);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < SHIP_WINDOW_COLUMNS; i++) {
        const lit = windowRandom() > 0.25 ? 1 : 0.001;
        windows.setMatrixAt(row * SHIP_WINDOW_COLUMNS + i, m.compose(pos.set(-half + 0.3 + (i * (SHIP_LENGTH - 0.6)) / (SHIP_WINDOW_COLUMNS - 1), 0.12 - row * 0.2, 0.71), rot.setFromEuler(0, 0, 0), size.set(0.1 * lit, 0.06 * lit, 0.02)));
      }
    }

    // Data towers: genre counts as a distant skyline of glowing pillars.
    const counts = state.data.genres.slice(0, TOWER_SLOTS);
    const maxCount = Math.max(1, ...counts);
    this.towerHeights = counts.map((count) => 1.5 + (count / maxCount) * 6.5);
    this.towers = this.add(new InstancedMesh({ geometry: Geometry.cube(1), material: glow(scaled(p.cyan, 0.45), 0.85), count: Math.max(1, counts.length) }));

    if (previous) {
      // Continue from the previous scene's camera so theme/data rebuilds are seamless.
      this.camera3D.position.copy(previous.camera3D.position);
      this.look.copy(previous.look);
      this.time = previous.time;
      this.towerGrowth = previous.towerGrowth;
      this.floorFade.splice(0, 2, ...previous.floorFade);
    } else {
      this.camera3D.position.set(...SHOTS[this.view].position);
      this.look.set(...SHOTS[this.view].target);
      this.towerGrowth = this.view === 'data' ? 1 : 0;
      this.floorFade.splice(0, 2, ...SHOTS[this.view].floor);
    }
    this.camera3D.lookAt(this.look);
    this.layoutTowers();
    this.layoutFloor();
    this.placePlanets();
  }

  setView(view: StageView): void {
    this.view = view;
  }

  setPointer(x: number, y: number): void {
    this.pointerTarget.x = x;
    this.pointerTarget.y = y;
  }

  private layoutFloor(): void {
    const [start, end] = this.floorFade;
    const scroll = (this.time * 0.8) % GRID_STEP;
    const perLine = 2 * FLOOR_VERTS_PER_POINT;
    const cross = this.crossLines;
    const crossColors = cross.colors!;
    for (let line = 0; line * perLine * FLOATS_PER_VERTEX < cross.vertices.length; line++) {
      const z = GRID_FAR + line * GRID_STEP + scroll;
      const alpha = floorAlpha(z, start, end);
      for (let v = 0; v < perLine; v++) {
        const vertex = line * perLine + v;
        cross.vertices[vertex * FLOATS_PER_VERTEX + 2] = z + CROSS_Z_OFFSETS[v % FLOOR_VERTS_PER_POINT]!;
        crossColors[vertex * 4 + 3] = alpha;
      }
    }
    cross.markUpdated();

    if (start === this.alongFade[0] && end === this.alongFade[1]) return;
    const along = this.alongLines;
    const alongColors = along.colors!;
    for (let vertex = 0; vertex * FLOATS_PER_VERTEX < along.vertices.length; vertex++) {
      alongColors[vertex * 4 + 3] = floorAlpha(along.vertices[vertex * FLOATS_PER_VERTEX + 2]!, start, end);
    }
    along.markUpdated();
    this.alongFade[0] = start;
    this.alongFade[1] = end;
  }

  private layoutTowers(): void {
    const growth = 1 - (1 - this.towerGrowth) ** 3;
    const count = this.towerHeights.length;
    // Fully collapsed pillars would still show as glowing floor tiles.
    this.towers.visible = count > 0 && growth > 0;
    this.towerHeights.forEach((full, i) => {
      const a = Math.PI * (0.15 + (0.7 * (i + 0.5)) / count);
      const height = Math.max(0.001, full * growth);
      this.position.set(-5 - Math.cos(a) * 11, FLOOR_Y + height / 2, -20 - Math.sin(a) * 4);
      this.rotation.setFromEuler(0, Math.PI / 2 - a, 0);
      this.towers.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.size.set(0.9, height, 0.9)));
    });
  }

  private placePlanets(): void {
    for (const s of this.planets) {
      const a = s.phase + this.time * s.speed;
      s.holder.position.set(Math.cos(a) * s.radius, 0, Math.sin(a) * s.radius);
      // A Y rotation by -a carries the trail arcs (drawn behind angle 0) to angle a.
      s.trail.rotation.setFromEuler(0, -a, 0);
      s.body.rotation.setFromEuler(0, this.time * s.spin, 0);
    }
  }

  override update(): void {
    // The stage driver pauses the engine between frames, which resets the engine
    // clock, so frame time is measured here.
    const now = performance.now();
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    const animate = this.motion;
    if (animate) this.time += dt;
    const ease = animate ? 1 - Math.exp(-dt * 2.2) : 1;
    const follow = animate ? 1 - Math.exp(-dt * 3) : 1;

    // Camera glides toward the route's shot, with gentle pointer parallax.
    const shot = (window.innerWidth < window.innerHeight && PORTRAIT_SHOTS[this.view]) || SHOTS[this.view];
    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * follow;
    this.pointer.y += (this.pointerTarget.y - this.pointer.y) * follow;
    const drift = animate ? Math.sin(this.time * 0.25) * 0.25 : 0;
    this.camGoal.set(shot.position[0] + this.pointer.x * 0.8 + drift, shot.position[1] - this.pointer.y * 0.5, shot.position[2]);
    this.lookGoal.set(...shot.target);
    const cam = this.camera3D.position;
    cam.set(cam.x + (this.camGoal.x - cam.x) * ease, cam.y + (this.camGoal.y - cam.y) * ease, cam.z + (this.camGoal.z - cam.z) * ease);
    const look = this.look;
    look.set(look.x + (this.lookGoal.x - look.x) * ease, look.y + (this.lookGoal.y - look.y) * ease, look.z + (this.lookGoal.z - look.z) * ease);
    this.camera3D.lookAt(look);
    // Settle exactly, so the z lines stop being rewritten once the fade arrives.
    for (let i = 0; i < 2; i++) {
      const goal = shot.floor[i]!;
      const next = this.floorFade[i]! + (goal - this.floorFade[i]!) * ease;
      this.floorFade[i] = Math.abs(goal - next) < 0.01 ? goal : next;
    }
    this.layoutFloor();

    if (animate) {
      this.stars.rotation.setFromEuler(0, this.time * 0.01, 0);
      this.core.rotation.setFromEuler(0, this.time * 0.04, 0);
      this.scanner.rotation.setFromEuler(0, -this.time * 0.18, 0);
      if (this.belt) this.belt.rotation.setFromEuler(0, this.time * this.beltSpeed, 0);
      this.ship.position.set(SHIP[0] + Math.sin(this.time * 0.04) * 1.8, SHIP[1], SHIP[2]);
      this.placePlanets();
    }

    const growthGoal = this.view === 'data' ? 1 : 0;
    if (this.towerGrowth !== growthGoal) {
      const step = animate ? dt * 0.9 : 1;
      this.towerGrowth = growthGoal > this.towerGrowth ? Math.min(1, this.towerGrowth + step) : Math.max(0, this.towerGrowth - step);
      this.layoutTowers();
    }
  }

  protected override onDestroy(): void {
    this.background?.destroy();
  }
}

/**
 * Full-viewport XYZ.js 3D backdrop. Resolves to null when no 3D-capable backend
 * (WebGPU or WebGL2) is available, leaving the CSS background in place.
 */
export async function createStage(canvas: HTMLCanvasElement, initial: StageState): Promise<Stage | null> {
  let game: Game | undefined;
  try {
    // Measured on WebGPU at 1440×900: MSAA at 1.5× resolution cost ~11 ms of GPU per
    // frame; 1× without MSAA (FXAA still on) costs ~4 ms with no visible loss for a
    // soft, bloomed backdrop. Below 1× the distant grid lines break up.
    game = await Game.create({ canvas, renderer: 'auto', antialias: false, pixelRatio: 1 });
    if (!game.graphics.capabilities.threeD) {
      game.destroy();
      return null;
    }
  } catch (error) {
    game?.destroy();
    console.warn('3D stage unavailable:', error);
    return null;
  }
  const engine = game;
  engine.addEventListener('error', (event) => console.error('3D stage error:', (event as CustomEvent<Error>).detail));

  const image = new OffscreenCanvas(1, 1);
  const context = image.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 1, 1);
  const white = await Texture.fromImage(image);
  // Painting runs on the main thread, so maps are made one at a time: each await
  // yields between them instead of blocking the page in one long task.
  const star = await sphereTexture(paintStar, 128);
  const ring = await ringTexture();
  const corona = await coronaTexture(1 / CORONA_SCALE);
  const nebulae: Texture[] = [];
  for (let i = 0; i < NEBULAE.length; i++) nebulae.push(await nebulaTexture(i * 7.3 + 1.7));
  const planets: Texture[] = [];
  for (const kind of PLANETS) planets.push(await sphereTexture(kind.paint, kind.map));
  const textures: StageTextures = { white, star, ring, corona, nebulae, planets };

  let state = initial;
  let current = new StageScene(textures, state);
  await engine.setScene(current);

  // An ambient backdrop does not need the display's full refresh rate: render at
  // most 24 fps, and under reduced motion or while idle only for a moment after something changes.
  // XYZ.js has no frame cap, so the engine is resumed for one frame at a time. Our
  // rAF callback is registered after the engine's, so it runs right after each
  // engine frame and pauses it again before the next one.
  let wakeUntil = 0;
  let nextFrame = 0;
  let looping = false;
  let failed = false;
  const tick = (now: number): void => {
    if (engine.state === 'running') engine.pause();
    const animating = state.motion && !state.idle;
    const due = !state.paused && (animating ? now >= nextFrame : now < wakeUntil);
    if (due) {
      // Advance by the interval rather than from `now`, so on a 60 Hz display the gaps
      // alternate between 2 and 3 vsyncs and average out to the target rate.
      nextFrame = Math.max(nextFrame + FRAME_INTERVAL_MS, now - FRAME_INTERVAL_MS);
      try {
        engine.resume();
      } catch (error) {
        // After a fatal frame error the engine refuses to restart; leave the last frame up.
        console.warn('3D stage stopped:', error);
        failed = true;
        looping = false;
        return;
      }
    }
    // Paused: this tick has stopped the engine, so the loop ends until the next wake.
    looping = (!state.paused && (animating || now < wakeUntil)) || engine.state === 'running';
    if (looping) requestAnimationFrame(tick);
  };
  const wake = (): void => {
    wakeUntil = Math.max(wakeUntil, performance.now() + WAKE_MS);
    if (!looping && !failed) {
      looping = true;
      requestAnimationFrame(tick);
    }
  };
  // A resize clears the canvas, so a still stage has to redraw.
  window.addEventListener('resize', wake);
  wake();

  return {
    update(next) {
      const rebuild = next.theme !== state.theme || next.motion !== state.motion || next.data.games !== state.data.games || next.data.genres.join() !== state.data.genres.join();
      state = next;
      if (rebuild) {
        current = new StageScene(textures, next, current);
        // Scene preparation is async; redraw once it is active as well.
        void engine.setScene(current).then(wake);
      } else {
        current.setView(next.view);
      }
      wake();
    },
    setPointer(x, y) {
      current.setPointer(x, y);
    },
  };
}

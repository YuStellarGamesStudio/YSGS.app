import { Billboard, EnvironmentMap, Game, Geometry, Group, InstancedMesh, Line3D, Matrix4, Mesh, PBRMaterial, PerspectiveCamera, PointLight, Quaternion, Scene, SpotLight, Texture, Vector3 } from 'xyz.js';
import type { PBRMaterialOptions } from 'xyz.js';
import { buildShip } from './stage-ship';
import type { Ship } from './stage-ship';
import type { Painter } from './stage-textures';
import { bracketTexture, coronaTexture, hullTexture, nebulaTexture, paintCloudy, paintGiant, paintIce, paintOcean, paintRinged, paintRocky, paintRust, paintStar, radiatorTexture, ringTexture, sphereTexture } from './stage-textures';

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
  /** Spotlight standing in for starlight on the distant ship; light skies already light it. */
  shipLight: number;
  star: RGB;
  /** Emissive tint of the meteors that streak across the sky. */
  meteor: RGB;
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
    shipLight: 200,
    star: [1.6, 1.9, 2.4],
    meteor: [2.4, 2.8, 3.6],
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
    orbitOpacity: 0.8,
    starLight: 10,
    shipLight: 30,
    star: [0.1, 0.18, 0.4],
    meteor: [0.05, 0.35, 0.7],
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
// Cross lines and near-field dust both drift toward the camera at this speed (units/s).
const FLOOR_SPEED = 0.8;
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
// Deep-space hauler cruising through the middle distance: where it starts, its heading (yaw;
// the bow points along local -X) and speed. It wraps once SHIP_RANGE units from the start,
// which is outside every shot.
const SHIP: Vec3 = [1.5, 5.2, -18];
const SHIP_YAW = 0.35;
const SHIP_SPEED = 0.15;
const SHIP_RANGE = 44;
// The star's point light does not reach that far, so a spotlight on the line from the ship to
// the star lights the side that faces it.
const SHIP_LIGHT_OFFSET = 9;
const STROBE_PERIOD = 1.7;
const STROBE_FLASH = 0.09;
// Free-floating dust around the camera; its parallax against the far stars gives depth.
const DUST_COUNT = 140;
const DUST_MIN: Vec3 = [-16, -1, -30];
const DUST_MAX: Vec3 = [16, 9, 6];
/** Dust grows in and fades out over this distance at either end of its drift. */
const DUST_FADE = 4;
// Sonar pings: rings sweeping out from under the star across the reference plate, staggered
// evenly over the period. They share the depth cue of a ring this far out.
const PING_COUNT = 2;
const PING_PERIOD = 6;
const PING_SEGMENTS = 128;
const PING_START = 0.3;
const PING_DEPTH_RADIUS = 2;
// Meteors: brief streaks across the upper sky, one per period, each on its own cycle.
const METEOR_PERIODS = [9, 14];
const METEOR_LIFE = 1.1;
const METEOR_SPEED = 14;
const METEOR_LENGTH = 3.5;
// Energy pulse racing over the floor grid toward the camera: a band of cross lines as
// [z offset, strength], sent out once per period.
const PULSE_BAND: Array<[number, number]> = [
  [-0.12, 0.2],
  [-0.06, 0.55],
  [0, 1],
  [0.06, 0.55],
  [0.12, 0.2],
];
const PULSE_PERIOD = 7;
const PULSE_SPEED = 9;
// Target lock: HUD brackets hop to another planet each period, zooming in and blinking while
// they acquire, then holding until shortly before the next hop.
const LOCK_PERIOD = 4.5;
const LOCK_ACQUIRE = 0.5;
const LOCK_HOLD = 3.9;
const LOCK_MARGIN = 0.1;
const BASE_FOV = (55 * Math.PI) / 180;
// Hyperjump on every route change: the lens widens, bloom flares and the floor and dust rush
// toward the camera, then everything settles back over the duration.
const JUMP_DURATION = 1.2;
const JUMP_FOV = (16 * Math.PI) / 180;
const JUMP_BLOOM = 1.2;
const JUMP_RUSH = 10;
// Ship-to-star comm link: a thin beam with data packets running along it, shown while the
// ship is within range of the star and fading in over the last LINK_FADE units.
const LINK_RANGE = 22;
const LINK_FADE = 6;
/** The beam ends this far short of the star's centre, outside the scanner ring. */
const LINK_STOP = 1;
const LINK_PACKETS = 5;
/** Packets travel this fraction of the beam per second. */
const LINK_SPEED = 0.3;
const LINK_PACKET_SIZE = 0.1;
// Anamorphic lens streak through the star.
const FLARE_WIDTH = 8;
const FLARE_HEIGHT = 0.45;
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
// Comet-like wake behind each planet: the radians of orbit it spans as it fades to nothing.
const TRAIL_LENGTH = 1.1;
const TRAIL_SEGMENTS = 24;
// Depth cues. Orbit lines fade on the side away from the home camera, and each planet drops a
// line to a reference plate this far below the orbital plane, with a ring marking its foot.
const ORBIT_FAR_ALPHA = 0.18;
const PLATE_DROP = 0.9;
const PLATE_RINGS = [1, 2, 3, 3.7];
const PLATE_SPOKES = 12;
const FOOT_RADIUS = 0.05;
// A trailing radar wedge rotates over the reference plate and lights up planet foot markers.
const SWEEP_SPEED = 0.9;
const SWEEP_SPAN = 1.1;
const SWEEP_STEPS = 24;
const SWEEP_FLARE = 1.8;

export interface StageTextures {
  white: Texture;
  star: Texture;
  ring: Texture;
  corona: Texture;
  nebulae: Texture[];
  planets: Texture[];
  hull: Texture;
  radiator: Texture;
  bracket: Texture;
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

/** Deterministic value in [0, 1) for an integer, so timed effects can be shown at any time. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hyperjump intensity in [0, 1] with `left` seconds remaining: a fast rise, then a slow settle. */
function jumpEnvelope(left: number): number {
  const progress = 1 - left / JUMP_DURATION;
  const attack = 0.12;
  return progress < attack ? progress / attack : (1 - (progress - attack) / (1 - attack)) ** 2;
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

/**
 * Gives a Line3D per-point alpha, which fades its emission too. Relies on Line3D's layout:
 * each segment is a quad of two vertices at its start point, then two at its end point.
 */
function fadeLine(line: Line3D, alpha: (point: number) => number): void {
  const points = line.pointCount;
  const segments = line.closed ? points : points - 1;
  const colors = new Float32Array(segments * 16);
  for (let s = 0; s < segments; s++) {
    const from = alpha(s);
    const to = alpha((s + 1) % points);
    colors.set([1, 1, 1, from, 1, 1, 1, from, 1, 1, 1, to, 1, 1, 1, to], s * 16);
  }
  line.geometry.setColors(colors);
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

/** Triangle fan trailing +X, with the leading edge brighter than the tail. */
function sweepFan(radius: number): Geometry {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const uvs = [0, 0];
  const colors = [1, 1, 1, 0.05];
  const indices: number[] = [];
  for (let i = 0; i <= SWEEP_STEPS; i++) {
    const a = (SWEEP_SPAN * i) / SWEEP_STEPS;
    positions.push(Math.cos(a) * radius, 0, -Math.sin(a) * radius);
    normals.push(0, 1, 0);
    uvs.push(0, 0);
    colors.push(1, 1, 1, 0.6 * (1 - i / SWEEP_STEPS) ** 2);
    if (i) indices.push(0, i, i + 1);
  }
  return new Geometry({ positions, normals, uvs, indices, colors });
}

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

/** Moves cross line `line` of a floorLines geometry to depth `z` with the given alpha. */
function placeCrossLine(geometry: Geometry, line: number, z: number, alpha: number): void {
  const perLine = 2 * FLOOR_VERTS_PER_POINT;
  const colors = geometry.colors!;
  for (let v = 0; v < perLine; v++) {
    const vertex = line * perLine + v;
    geometry.vertices[vertex * FLOATS_PER_VERTEX + 2] = z + CROSS_Z_OFFSETS[v % FLOOR_VERTS_PER_POINT]!;
    colors[vertex * 4 + 3] = alpha;
  }
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
  private readonly planets: Array<{ holder: Group; body: Mesh; trail: Line3D; orbit: Matrix4; drop: Line3D; foot: Line3D; radius: number; speed: number; phase: number; spin: number }> = [];
  private readonly towers: InstancedMesh;
  private readonly scanner: Group;
  private readonly sweep: Group;
  private belt: Group | null = null;
  private beltSpeed = 0;
  private readonly ship: Ship;
  private readonly shipLight: SpotLight;
  private readonly dust: InstancedMesh;
  /** Per dust particle: x, y, z offset into its drift, and radius. */
  private readonly dustSeeds = new Float32Array(DUST_COUNT * 4);
  private readonly towerHeights: number[];
  private readonly pulse: Geometry;
  private readonly pings: Line3D[] = [];
  /** Per ping point: depth-cue alpha, then the unit circle's cos and sin. */
  private readonly pingShape = new Float32Array(PING_SEGMENTS * 3);
  private readonly meteors: Line3D[] = [];
  private readonly lock: Billboard;
  private readonly lockSize: number[];
  private readonly systemMatrix: Matrix4;
  private readonly link: Line3D;
  private readonly packets: InstancedMesh;
  private readonly flare: Billboard;
  private readonly baseBloom: number;
  private readonly lens: PerspectiveCamera;
  // Scratch values reused every frame to avoid per-frame allocation.
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly size = new Vector3();
  private time = 0;
  private lastTick = 0;
  private towerGrowth = 0;
  /** Lock cycle last shown and the planet it targets; each new cycle hops to another planet. */
  private lockCycle = 0;
  private lockTarget = 0;
  /** Seconds left of the current hyperjump; zero when none is running. */
  private jumpLeft = 0;
  /** How far the floor and dust have drifted toward the camera; it runs faster during a jump. */
  private flow = 0;
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
    this.baseBloom = p.bloom;
    this.postProcessing.bloomStrength = p.bloom;
    this.postProcessing.bloomThreshold = 1;
    this.postProcessing.bloomRadius = 3;
    this.postProcessing.fxaa = true;
    // Sorted transparency writes depth, so the corona quad punched holes in the orbits behind it.
    this.transparency = 'weighted';
    this.background = EnvironmentMap.gradient({ zenith: p.zenith, horizon: p.horizon, ground: p.ground, width: 128 });
    const camera = new PerspectiveCamera();
    camera.fov = BASE_FOV;
    camera.far = 200;
    this.camera3D = camera;
    this.lens = camera;

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
    // Energy pulse; hidden under reduced motion, since it only reads as movement.
    this.pulse = floorLines(PULSE_BAND.map((): FloorLine => ({ points: [[-GRID_HALF_WIDTH, 0], [GRID_HALF_WIDTH, 0]], across: [0, 1] })));
    floor.add(new Mesh({ geometry: this.pulse, material: glow(scaled(p.cyan, 0.8), 1, { transparent: true, alphaMode: 'BLEND', doubleSided: true }), position: [0, 0.004, 0], visible: this.motion }));

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

    // Dust drifting past the camera, seeded like the stars.
    this.dust = this.add(new InstancedMesh({ geometry: Geometry.sphere(1, 6, 4), material: glow(scaled(p.star, 0.45)), count: DUST_COUNT }));
    const dustRandom = mulberry32(0xd057);
    for (let i = 0; i < DUST_COUNT; i++) {
      this.dustSeeds.set(
        [
          DUST_MIN[0] + dustRandom() * (DUST_MAX[0] - DUST_MIN[0]),
          DUST_MIN[1] + dustRandom() * (DUST_MAX[1] - DUST_MIN[1]),
          dustRandom() * (DUST_MAX[2] - DUST_MIN[2]),
          0.008 + dustRandom() ** 3 * 0.022,
        ],
        i * 4,
      );
    }

    // Planetary system: a blue-white star lighting one planet per published game.
    // Planets are lit only by the star's point light, so they show real phases.
    const system = this.add(new Group());
    system.position.set(...CORE);
    system.rotation.setFromEuler(0.38, 0, -0.16);
    this.systemMatrix = system.transform.updateMatrix();
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

    // Comm link from the ship to the star; placeLink moves and fades it, only in motion.
    this.link = this.add(new Line3D([[0, 0, 0], [1, 0, 0]], { material: glow(scaled(p.cyan, 0.8), 1, { transparent: true, alphaMode: 'BLEND' }), width: 0.045, visible: false }));
    fadeLine(this.link, () => 1);
    this.packets = this.add(new InstancedMesh({ geometry: Geometry.sphere(1, 8, 6), material: glow(p.cyan), count: LINK_PACKETS }));
    this.packets.visible = false;

    // The streak is a stretched corona sprite, so it stays level on screen.
    this.flare = this.add(
      new Billboard({
        material: new PBRMaterial({ texture: textures.corona, color: [0, 0, 0], emissive: scaled(p.cyan, 0.4), emissiveTexture: textures.corona, transparent: true, alphaMode: 'BLEND' }),
        width: FLARE_WIDTH,
        height: FLARE_HEIGHT,
        position: CORE,
      }),
    );
    // Depth cue: alpha from how near each point of a line lies to the home camera, relative to
    // `radius` around the star, times an optional per-point factor.
    const toCamera = new Vector3(...SHOTS.home.position).subtract(new Vector3(...CORE)).normalize();
    const depthFade = (line: Line3D, radius: number, factor: (point: number) => number = () => 1): void => {
      const world = line.updateWorldMatrix();
      fadeLine(line, (point) => {
        world.transformPoint(pos.set(...line.point(point)), pos);
        const toward = (pos.x - CORE[0]) * toCamera.x + (pos.y - CORE[1]) * toCamera.y + (pos.z - CORE[2]) * toCamera.z;
        const t = Math.min(1, Math.max(0, toward / radius / 2 + 0.5));
        return (ORBIT_FAR_ALPHA + (1 - ORBIT_FAR_ALPHA) * t * t * (3 - 2 * t)) * factor(point);
      });
    };
    // Vertex alpha only counts in the transparent pass. On light skies the lit surface colour
    // dominates, so keep it as dark as the orbit tint or the lines vanish into the sky.
    const faded = { transparent: true, alphaMode: 'BLEND' as const, ...(p.tintedSurfaces ? { color: p.orbit } : {}) };
    const orbitMaterial = glow(p.orbit, p.orbitOpacity, faded);
    const trailMaterial = glow(scaled(p.orbit, 2.2), Math.min(1, p.orbitOpacity * 2.6), faded);
    const dropMaterial = glow(scaled(p.orbit, 1.4), Math.min(1, p.orbitOpacity * 1.8), faded);
    const plateMaterial = glow(p.orbit, p.orbitOpacity * 0.55, faded);
    const ringMaterial = new PBRMaterial({ texture: textures.ring, roughness: 0.9, transparent: true, alphaMode: 'BLEND', doubleSided: true });
    const orbitRandom = mulberry32(0x0b17);
    const count = state.data.games;
    for (let i = 0; i < count; i++) {
      const kind = PLANETS[i % PLANETS.length]!;
      const radius = count > 1 ? ORBIT_INNER + ((ORBIT_OUTER - ORBIT_INNER) * i) / (count - 1) : (ORBIT_INNER + ORBIT_OUTER) / 2;
      // Real orbits are nearly coplanar: a few degrees of inclination at most.
      const plane = system.add(new Group());
      plane.rotation.setFromEuler((orbitRandom() - 0.5) * 0.14, 0, (orbitRandom() - 0.5) * 0.14);
      // Sub-pixel ribbons break into dashes, so orbits stay about a pixel wide and dim instead.
      depthFade(plane.add(new Line3D(circle(radius, 160), { material: orbitMaterial, width: 0.014, closed: true })), radius);
      const trail = plane.add(new Line3D(arc(radius, -TRAIL_LENGTH, 0, TRAIL_SEGMENTS), { material: trailMaterial, width: 0.022 }));
      fadeLine(trail, (point) => (point / TRAIL_SEGMENTS) ** 1.6);
      // The holder keeps the spin axis fixed in space while the planet travels.
      const holder = plane.add(new Group());
      holder.rotation.setFromEuler(kind.axialTilt, orbitRandom() * Math.PI, 0);
      const body = holder.add(
        new Mesh({ geometry: Geometry.sphere(kind.radius, 32, 16), material: new PBRMaterial({ texture: textures.planets[i % PLANETS.length]!, roughness: kind.roughness }) }),
      );
      if (kind.ring) holder.add(new Mesh({ geometry: Geometry.plane(kind.radius * 4.7, kind.radius * 4.7), material: ringMaterial }));
      // Drop line and foot ring live in system space, so they meet the plate square on.
      const drop = system.add(new Line3D([[0, 0, 0], [0, -PLATE_DROP, 0]], { material: dropMaterial, width: 0.008 }));
      fadeLine(drop, (point) => (point ? 0.3 : 1));
      const foot = system.add(new Line3D(circle(FOOT_RADIUS, 16), { material: dropMaterial, width: 0.01, closed: true }));
      this.planets.push({ holder, body, trail, orbit: plane.transform.updateMatrix(), drop, foot, radius, speed: KEPLER * radius ** -1.5, phase: i * 2.399, spin: 0.4 + orbitRandom() * 0.6 });
    }

    // Reference plate under the system: range rings, spokes fading outward, and the star's axis.
    const plateLine = (points: Vec3[], radius: number, closed: boolean, factor?: (point: number) => number): void => {
      depthFade(system.add(new Line3D(points, { material: plateMaterial, width: 0.01, closed, position: [0, -PLATE_DROP, 0] })), radius, factor);
    };
    const plateRadius = PLATE_RINGS[PLATE_RINGS.length - 1]!;
    for (const radius of PLATE_RINGS) plateLine(circle(radius, 128), radius, true);
    for (let k = 0; k < PLATE_SPOKES; k++) {
      const a = (k / PLATE_SPOKES) * Math.PI * 2;
      plateLine([[Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * plateRadius, 0, Math.sin(a) * plateRadius]], plateRadius, false, (point) => (point ? 0 : 1));
    }
    plateLine([[0, PLATE_DROP - STAR_RADIUS * 1.2, 0], [0, 0, 0]], plateRadius, false, (point) => (point ? 0.6 : 0));

    this.sweep = system.add(new Group());
    this.sweep.position.y = -PLATE_DROP;
    this.sweep.visible = this.motion;
    this.sweep.add(new Mesh({ geometry: sweepFan(plateRadius), material: glow(scaled(p.cyan, 0.5), 1, { transparent: true, alphaMode: 'BLEND', doubleSided: true }) }));
    const sweepEdge = this.sweep.add(new Line3D([[0, 0, 0], [plateRadius, 0, 0]], { material: glow(scaled(p.cyan, 0.9), 1, { transparent: true, alphaMode: 'BLEND' }), width: 0.02 }));
    fadeLine(sweepEdge, (point) => (point ? 1 : 0.15));
    // Sonar pings; like the pulse, only shown in motion.
    const pingMaterial = glow(p.cyan, 1, { transparent: true, alphaMode: 'BLEND' });
    for (let k = 0; k < PING_COUNT; k++) {
      const ping = system.add(new Line3D(circle(PING_DEPTH_RADIUS, PING_SEGMENTS), { material: pingMaterial, width: 0.022, closed: true, position: [0, -PLATE_DROP, 0], visible: this.motion }));
      depthFade(ping, PING_DEPTH_RADIUS);
      this.pings.push(ping);
    }
    const pingColors = this.pings[0]!.geometry.colors!;
    for (let i = 0; i < PING_SEGMENTS; i++) {
      const a = (i / PING_SEGMENTS) * Math.PI * 2;
      this.pingShape.set([pingColors[i * 16 + 3]!, Math.cos(a), Math.sin(a)], i * 3);
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

    // Target-lock brackets, framing a planet with a margin so small worlds still read. A
    // billboard ignores parent rotation, so it lives in the scene root.
    this.lock = this.add(
      new Billboard({
        material: new PBRMaterial({ texture: textures.bracket, color: [0, 0, 0], emissive: p.cyan, emissiveTexture: textures.bracket, transparent: true, alphaMode: 'BLEND' }),
        visible: count > 0,
      }),
    );
    this.lockSize = this.planets.map((_, i) => PLANETS[i % PLANETS.length]!.radius * 2 * (PLANETS[i % PLANETS.length]!.ring ? 2.3 : 1) + LOCK_MARGIN * 2);

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

    // Meteors, bright at the head and fading along the tail; placeEffects shows them.
    const meteorMaterial = glow(p.meteor, 1, { transparent: true, alphaMode: 'BLEND' });
    for (let i = 0; i < METEOR_PERIODS.length; i++) {
      const meteor = this.add(new Line3D([[0, 0, 0], [1, 0, 0]], { material: meteorMaterial, width: 0.07, visible: false }));
      fadeLine(meteor, (point) => (point ? 0 : 1));
      this.meteors.push(meteor);
    }

    // A deep-space hauler cruising through the middle distance.
    this.ship = buildShip({
      hull: new PBRMaterial({ texture: textures.hull, color: p.tintedSurfaces ? [0.62, 0.66, 0.74] : [0.9, 0.91, 0.93], metallic: 0.1, roughness: 0.6, textureSampler: { addressModeU: 'repeat', addressModeV: 'repeat' } }),
      metal: new PBRMaterial({ texture: white, color: [0.3, 0.32, 0.36], metallic: 0.75, roughness: 0.4, doubleSided: true }),
      radiator: new PBRMaterial({ texture: textures.radiator, color: [0.9, 0.9, 0.92], roughness: 0.7 }),
      window: glow([2.4, 1.9, 1.1]),
      engine: glow(p.primary),
      plume: glow(scaled(p.cyan, 0.7), 1, { transparent: true, alphaMode: 'BLEND', doubleSided: true }),
      exhaust: glow(p.primary, 1, { transparent: true, alphaMode: 'BLEND', doubleSided: true }),
      sparks: glow(p.primary, 0.85),
      port: glow([3, 0.12, 0.08]),
      starboard: glow([0.1, 3, 0.4]),
      strobe: glow([4, 4, 4]),
    });
    this.add(this.ship.root);
    this.ship.root.rotation.setFromEuler(0, SHIP_YAW, 0);
    this.shipLight = new SpotLight({ color: [0.88, 0.94, 1], intensity: p.shipLight, range: SHIP_LIGHT_OFFSET + 7, innerAngle: 0.4, outerAngle: 0.55 });
    this.spotLights.push(this.shipLight);

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
      this.lockCycle = previous.lockCycle;
      this.lockTarget = previous.lockTarget % Math.max(1, state.data.games);
      this.jumpLeft = previous.jumpLeft;
      this.flow = previous.flow;
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
    this.placeLock();
    this.placeShip();
    this.layoutDust();
    if (this.motion) this.placeEffects();
  }

  setView(view: StageView): void {
    // A still stage has no motion to jump with.
    if (view !== this.view && this.motion) this.jumpLeft = JUMP_DURATION;
    this.view = view;
  }

  setPointer(x: number, y: number): void {
    this.pointerTarget.x = x;
    this.pointerTarget.y = y;
  }

  private layoutFloor(): void {
    const [start, end] = this.floorFade;
    const scroll = this.flow % GRID_STEP;
    const cross = this.crossLines;
    const lines = cross.vertices.length / (2 * FLOOR_VERTS_PER_POINT * FLOATS_PER_VERTEX);
    for (let line = 0; line < lines; line++) {
      const z = GRID_FAR + line * GRID_STEP + scroll;
      placeCrossLine(cross, line, z, floorAlpha(z, start, end));
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
    const point = this.position;
    const sweepAngle = (this.time * SWEEP_SPEED) % (2 * Math.PI);
    this.sweep.rotation.setFromEuler(0, -sweepAngle, 0);
    for (const s of this.planets) {
      const a = s.phase + this.time * s.speed;
      s.holder.position.set(Math.cos(a) * s.radius, 0, Math.sin(a) * s.radius);
      // A Y rotation by -a carries the trail arc (drawn behind angle 0) to angle a.
      s.trail.rotation.setFromEuler(0, -a, 0);
      s.body.rotation.setFromEuler(0, this.time * s.spin, 0);
      // The planet in system space, dropped onto the plate.
      s.orbit.transformPoint(point.copy(s.holder.position), point);
      s.drop.setPoint(0, point.x, point.y, point.z);
      s.drop.setPoint(1, point.x, -PLATE_DROP, point.z);
      s.foot.position.set(point.x, -PLATE_DROP, point.z);
      if (this.motion) {
        const behind = (sweepAngle - Math.atan2(point.z, point.x) + 2 * Math.PI) % (2 * Math.PI);
        const flare = 1 + SWEEP_FLARE * Math.exp(-behind * 2.5);
        s.foot.scale.set(flare, flare, flare);
      }
    }
  }

  private placeLock(): void {
    const count = this.planets.length;
    if (!count) return;
    // Under reduced motion the brackets hold steady on the innermost planet.
    const cycle = this.motion ? Math.floor(this.time / LOCK_PERIOD) : 0;
    const age = this.motion ? this.time - cycle * LOCK_PERIOD : LOCK_ACQUIRE;
    if (this.motion && cycle !== this.lockCycle) {
      // Step 1 to count - 1 planets ahead, so the hop never stays put but looks unplanned.
      this.lockCycle = cycle;
      this.lockTarget = (this.lockTarget + 1 + Math.floor(hash01(cycle) * (count - 1))) % count;
    }
    const target = this.motion ? this.lockTarget : 0;
    const acquiring = age < LOCK_ACQUIRE;
    this.lock.visible = age < LOCK_HOLD && (!acquiring || Math.floor(age * 16) % 2 === 0);
    if (!this.lock.visible) return;
    const planet = this.planets[target]!;
    const point = this.position;
    planet.orbit.transformPoint(point.copy(planet.holder.position), point);
    this.systemMatrix.transformPoint(point, point);
    this.lock.position.copy(point);
    const zoom = acquiring ? 1 + 2 * (1 - age / LOCK_ACQUIRE) ** 3 : 1;
    const size = this.lockSize[target]! * zoom;
    this.lock.scale.set(size, size, size);
  }

  private placeEffects(): void {
    // Pings: each snaps on, then fades as it spreads to the plate's edge.
    const shape = this.pingShape;
    const outer = PLATE_RINGS[PLATE_RINGS.length - 1]!;
    for (let k = 0; k < this.pings.length; k++) {
      const ping = this.pings[k]!;
      const age = (this.time / PING_PERIOD + k / this.pings.length) % 1;
      const radius = PING_START + age * (outer - PING_START);
      const life = Math.min(1, age * 10) * (1 - age) ** 2;
      const colors = ping.geometry.colors!;
      for (let i = 0; i < PING_SEGMENTS; i++) {
        ping.setPoint(i, shape[i * 3 + 1]! * radius, 0, shape[i * 3 + 2]! * radius);
        const from = shape[i * 3]! * life;
        const to = shape[((i + 1) % PING_SEGMENTS) * 3]! * life;
        colors[i * 16 + 3] = colors[i * 16 + 7] = from;
        colors[i * 16 + 11] = colors[i * 16 + 15] = to;
      }
      ping.geometry.markUpdated();
    }

    // Meteors: each falls at a shallow angle from a random point high in the sky, its tail
    // growing in behind it and the whole streak flaring and fading over its short life.
    for (let i = 0; i < this.meteors.length; i++) {
      const meteor = this.meteors[i]!;
      const period = METEOR_PERIODS[i]!;
      const cycles = this.time / period + i * 0.37;
      const cycle = Math.floor(cycles);
      const age = (cycles - cycle) * period;
      meteor.visible = age < METEOR_LIFE;
      if (!meteor.visible) continue;
      const seed = cycle * 8 + i * 4099;
      const side = hash01(seed) < 0.5 ? -1 : 1;
      const angle = 0.2 + hash01(seed + 1) * 0.35;
      const dx = Math.cos(angle) * side;
      const dy = -Math.sin(angle);
      const travel = age * METEOR_SPEED;
      const x = -side * (4 + hash01(seed + 2) * 10) + dx * travel;
      const y = 9.5 + hash01(seed + 3) * 4 + dy * travel;
      const z = -14 - hash01(seed + 4) * 6;
      const tail = METEOR_LENGTH * Math.max(0.02, Math.min(1, age / 0.3));
      meteor.setPoint(0, x, y, z);
      meteor.setPoint(1, x - dx * tail, y - dy * tail, z);
      const colors = meteor.geometry.colors!;
      colors[3] = colors[7] = Math.sin((Math.PI * age) / METEOR_LIFE);
      meteor.geometry.markUpdated();
    }

    // Floor pulse, faded with the grid; past the near edge it is out of every shot.
    const [start, end] = this.floorFade;
    const z = GRID_FAR + (this.time % PULSE_PERIOD) * PULSE_SPEED;
    for (let line = 0; line < PULSE_BAND.length; line++) {
      const [offset, strength] = PULSE_BAND[line]!;
      placeCrossLine(this.pulse, line, z + offset, floorAlpha(z + offset, start, end) * strength);
    }
    this.pulse.markUpdated();
    this.placeLink();
  }

  private placeLink(): void {
    const from = this.ship.root.position;
    const dx = CORE[0] - from.x;
    const dy = CORE[1] - from.y;
    const dz = CORE[2] - from.z;
    const distance = Math.hypot(dx, dy, dz);
    const reach = Math.min(1, Math.max(0, (LINK_RANGE - distance) / LINK_FADE));
    const strength = reach * reach * (3 - 2 * reach);
    this.link.visible = this.packets.visible = strength > 0;
    if (!this.link.visible) return;
    const k = 1 - LINK_STOP / distance;
    const ex = from.x + dx * k;
    const ey = from.y + dy * k;
    const ez = from.z + dz * k;
    this.link.setPoint(0, from.x, from.y, from.z);
    this.link.setPoint(1, ex, ey, ez);
    const colors = this.link.geometry.colors!;
    colors[3] = colors[7] = strength * 0.9;
    colors[11] = colors[15] = strength * 0.35;
    this.link.geometry.markUpdated();
    for (let i = 0; i < LINK_PACKETS; i++) {
      const f = (this.time * LINK_SPEED + i / LINK_PACKETS) % 1;
      // Instance transforms must stay invertible, so a packet never shrinks to exactly zero.
      const radius = Math.max(1e-3, LINK_PACKET_SIZE * strength * Math.sin(Math.PI * f));
      this.packets.setMatrixAt(i, this.matrix.compose(this.position.set(from.x + (ex - from.x) * f, from.y + (ey - from.y) * f, from.z + (ez - from.z) * f), this.rotation, this.size.set(radius, radius, radius)));
    }
  }

  private placeShip(): void {
    // Cruise along the heading, from SHIP_RANGE behind the start point to SHIP_RANGE past it.
    const travel = ((this.time * SHIP_SPEED + SHIP_RANGE) % (2 * SHIP_RANGE)) - SHIP_RANGE;
    const ship = this.ship.root.position.set(SHIP[0] - Math.cos(SHIP_YAW) * travel, SHIP[1], SHIP[2] + Math.sin(SHIP_YAW) * travel);
    const toStar = this.size.set(CORE[0] - ship.x, CORE[1] - ship.y, CORE[2] - ship.z).normalize();
    this.shipLight.position.set(ship.x + toStar.x * SHIP_LIGHT_OFFSET, ship.y + toStar.y * SHIP_LIGHT_OFFSET, ship.z + toStar.z * SHIP_LIGHT_OFFSET);
    this.shipLight.direction.set(-toStar.x, -toStar.y, -toStar.z);
    this.ship.ring.rotation.setFromEuler(this.time * 0.25, 0, 0);
    this.ship.updateExhaust(this.time);
    const flash = !this.motion || this.time % STROBE_PERIOD < STROBE_FLASH;
    for (const strobe of this.ship.strobes) strobe.visible = flash;
  }

  private layoutDust(): void {
    const seeds = this.dustSeeds;
    const depth = DUST_MAX[2] - DUST_MIN[2];
    for (let i = 0; i < DUST_COUNT; i++) {
      const z = DUST_MIN[2] + ((seeds[i * 4 + 2]! + this.flow) % depth);
      const radius = seeds[i * 4 + 3]! * Math.max(1e-3, Math.min(1, (z - DUST_MIN[2]) / DUST_FADE, (DUST_MAX[2] - z) / DUST_FADE));
      this.dust.setMatrixAt(i, this.matrix.compose(this.position.set(seeds[i * 4]!, seeds[i * 4 + 1]!, z), this.rotation, this.size.set(radius, radius, radius)));
    }
  }

  override update(): void {
    // The stage driver pauses the engine between frames, which resets the engine
    // clock, so frame time is measured here.
    const now = performance.now();
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    const animate = this.motion;
    if (animate) {
      this.time += dt;
      this.jumpLeft = Math.max(0, this.jumpLeft - dt);
    }
    const warp = jumpEnvelope(this.jumpLeft);
    if (animate) this.flow += dt * FLOOR_SPEED * (1 + JUMP_RUSH * warp);
    this.lens.fov = BASE_FOV + JUMP_FOV * warp;
    this.postProcessing.bloomStrength = this.baseBloom * (1 + JUMP_BLOOM * warp);
    // Billboard folds width and height into its scale, so the size has to be reapplied here.
    this.flare.scale.set(FLARE_WIDTH * (1 + 0.05 * Math.sin(this.time * 1.3)) * (1 + 1.5 * warp), FLARE_HEIGHT * (1 + 0.2 * Math.sin(this.time * 0.7)), 1);
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
      this.placeShip();
      this.layoutDust();
      this.placePlanets();
      this.placeLock();
      this.placeEffects();
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
  const hull = await hullTexture();
  const radiator = await radiatorTexture();
  const bracket = await bracketTexture();
  const textures: StageTextures = { white, star, ring, corona, nebulae, planets, hull, radiator, bracket };

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

import { EnvironmentMap, Game, Geometry, Group, InstancedMesh, Line3D, Matrix4, Mesh, PBRMaterial, PerspectiveCamera, PointLight, Quaternion, Scene, Texture, Vector3 } from 'xyz.js';

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
  lime: RGB;
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
    grid: [0.03, 0.5, 0.7],
    cyan: [0.1, 2.6, 3.4],
    magenta: [3.2, 0.25, 2.6],
    lime: [1.5, 3, 0.35],
    star: [1.6, 1.9, 2.4],
    ambient: 0.15,
    sun: 0.6,
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
    grid: [0, 0.2, 0.32],
    cyan: [0, 0.55, 0.8],
    magenta: [0.8, 0.04, 0.6],
    lime: [0.3, 0.6, 0.04],
    star: [0.1, 0.18, 0.4],
    ambient: 0.6,
    sun: 1.4,
    bloom: 0.25,
  },
};

// Camera framing per route. The core sits right of centre so the home hero copy keeps the left.
const SHOTS: Record<StageView, { position: Vec3; target: Vec3 }> = {
  home: { position: [0, 1.6, 10], target: [0, 0.9, 0] },
  games: { position: [-3, 5.5, 14], target: [1, 0.2, -4] },
  // Detail pages are text-dense on both sides, so look away from the core toward open sky.
  game: { position: [-6, 4, 10], target: [-10, 2.5, -14] },
  data: { position: [-7, 2, 8], target: [-5, -1.5, -18] },
  missing: { position: [0, 9, 12], target: [0, 0, -2] },
};

const CORE: Vec3 = [3.6, 1.6, 0];
// Portrait screens stack the hero copy under the visual, so centre the core and lift it.
const PORTRAIT_SHOTS: Partial<Record<StageView, { position: Vec3; target: Vec3 }>> = {
  home: { position: [CORE[0], 3.2, 14], target: [CORE[0], -0.6, 0] },
};
const FLOOR_Y = -1.2;
const GRID_SIZE = 60;
const GRID_STEP = 2;
const STAR_COUNT = 700;
const TOWER_SLOTS = 16;

const RINGS: Array<{ radius: number; tint: 'cyan' | 'magenta' | 'lime'; tilt: Vec3; speed: number; width: number }> = [
  { radius: 1.7, tint: 'cyan', tilt: [0.35, 0, -0.42], speed: 0.35, width: 0.035 },
  { radius: 2.3, tint: 'magenta', tilt: [-0.5, 0, 0.55], speed: -0.22, width: 0.03 },
  { radius: 2.9, tint: 'lime', tilt: [0.12, 0, 0.18], speed: 0.12, width: 0.02 },
];

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

function circle(radius: number, segments = 96): Vec3[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
  });
}

class StageScene extends Scene {
  private readonly motion: boolean;
  private readonly pointerTarget = { x: 0, y: 0 };
  private readonly pointer = { x: 0, y: 0 };
  private readonly look = new Vector3();
  private readonly camGoal = new Vector3();
  private readonly lookGoal = new Vector3();
  private readonly grid: Group;
  private readonly stars: Group;
  private readonly core: Mesh;
  private readonly rings: Array<{ spin: Group; speed: number }> = [];
  private readonly satellites: Array<{ mesh: Mesh; radius: number; speed: number; phase: number }> = [];
  private readonly towers: InstancedMesh;
  private readonly towerHeights: number[];
  // Scratch values reused every frame to avoid per-frame allocation.
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly size = new Vector3();
  private time = 0;
  private towerGrowth = 0;
  private view: StageView;

  constructor(white: Texture, state: StageState, previous?: StageScene) {
    super();
    const p = PALETTES[state.theme];
    this.motion = state.motion;
    this.view = state.view;
    const glow = (emissive: RGB, opacity = 1): PBRMaterial => {
      const peak = Math.max(...emissive, 1e-6);
      const color: RGB = p.tintedSurfaces ? [(emissive[0] / peak) * 0.8, (emissive[1] / peak) * 0.8, (emissive[2] / peak) * 0.8] : p.base;
      return new PBRMaterial({ texture: white, color, emissive, roughness: 0.6, ...(opacity < 1 ? { opacity, transparent: true, alphaMode: 'BLEND' as const } : {}) });
    };

    this.ambientLight = p.ambient;
    this.directionalLight.intensity = p.sun;
    this.directionalLight.direction.set(-0.4, 1, 0.6).normalize();
    this.pointLights.push(new PointLight({ position: new Vector3(...CORE), color: [0.2, 0.9, 1], intensity: 12, range: 14 }));
    this.fog.enabled = true;
    this.fog.mode = 'exp2';
    this.fog.color = p.fog;
    this.fog.density = p.fogDensity;
    this.postProcessing.enabled = true;
    this.postProcessing.bloomStrength = p.bloom;
    this.postProcessing.bloomThreshold = 1;
    this.postProcessing.bloomRadius = 3;
    this.postProcessing.fxaa = true;
    this.background = EnvironmentMap.gradient({ zenith: p.zenith, horizon: p.horizon, ground: p.ground, width: 128 });
    const camera = new PerspectiveCamera();
    camera.fov = (55 * Math.PI) / 180;
    camera.far = 200;
    this.camera3D = camera;

    const { matrix: m, position: pos, rotation: rot, size } = this;

    // Holographic floor grid: thin instanced bars that scroll toward the camera.
    this.grid = this.add(new Group());
    this.grid.position.y = FLOOR_Y;
    const lines = Math.floor(GRID_SIZE / GRID_STEP) + 1;
    const gridMesh = this.grid.add(new InstancedMesh({ geometry: Geometry.cube(1), material: glow(p.grid), count: lines * 2 }));
    const gridCentreZ = 8 - GRID_SIZE / 2;
    for (let i = 0; i < lines; i++) {
      const offset = -GRID_SIZE / 2 + i * GRID_STEP;
      gridMesh.setMatrixAt(i, m.compose(pos.set(offset, 0, gridCentreZ), rot, size.set(0.025, 0.01, GRID_SIZE)));
      gridMesh.setMatrixAt(lines + i, m.compose(pos.set(0, 0, gridCentreZ + offset), rot, size.set(GRID_SIZE, 0.01, 0.025)));
    }

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

    // Core: glowing nucleus inside a translucent shell, wrapped by tilted orbit rings.
    const coreGroup = this.add(new Group());
    coreGroup.position.set(...CORE);
    this.core = coreGroup.add(new Mesh({ geometry: Geometry.sphere(0.45, 32, 16), material: glow(scaled(p.cyan, 1.4)) }));
    const tilts: Group[] = [];
    for (const ring of RINGS) {
      const tilt = coreGroup.add(new Group());
      tilt.rotation.setFromEuler(...ring.tilt);
      const spin = tilt.add(new Group());
      spin.add(new Line3D(circle(ring.radius), { material: glow(scaled(p[ring.tint], ring.tint === 'lime' ? 0.6 : 1)), width: ring.width, closed: true }));
      this.rings.push({ spin, speed: ring.speed });
      tilts.push(tilt);
    }

    // One satellite per published game, riding the tilted ring planes.
    for (let i = 0; i < state.data.games; i++) {
      const ring = RINGS[i % RINGS.length]!;
      const mesh = tilts[i % RINGS.length]!.add(new Mesh({ geometry: Geometry.sphere(0.09, 12, 8), material: glow(scaled(p[ring.tint], 1.3)) }));
      this.satellites.push({ mesh, radius: ring.radius, speed: ring.speed * 1.6, phase: (i / state.data.games) * Math.PI * 2 });
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
    } else {
      this.camera3D.position.set(...SHOTS[this.view].position);
      this.look.set(...SHOTS[this.view].target);
      this.towerGrowth = this.view === 'data' ? 1 : 0;
    }
    this.camera3D.lookAt(this.look);
    this.layoutTowers();
    this.placeSatellites();
  }

  setView(view: StageView): void {
    this.view = view;
  }

  setPointer(x: number, y: number): void {
    this.pointerTarget.x = x;
    this.pointerTarget.y = y;
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

  private placeSatellites(): void {
    for (const s of this.satellites) {
      const a = s.phase + this.time * s.speed;
      s.mesh.position.set(Math.cos(a) * s.radius, 0, Math.sin(a) * s.radius);
    }
  }

  override update(dt: number): void {
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

    if (animate) {
      this.grid.position.z = (this.time * 0.8) % GRID_STEP;
      this.stars.rotation.setFromEuler(0, this.time * 0.01, 0);
      for (const ring of this.rings) ring.spin.rotation.setFromEuler(0, this.time * ring.speed, 0);
      const pulse = 1 + Math.sin(this.time * 2.4) * 0.08;
      this.core.scale.set(pulse, pulse, pulse);
      this.placeSatellites();
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
    game = await Game.create({ canvas, renderer: 'auto', pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) });
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

  let state = initial;
  let current = new StageScene(white, state);
  await engine.setScene(current);
  engine.start();

  return {
    update(next) {
      const rebuild = next.theme !== state.theme || next.motion !== state.motion || next.data.games !== state.data.games || next.data.genres.join() !== state.data.genres.join();
      state = next;
      if (!rebuild) {
        current.setView(next.view);
        return;
      }
      current = new StageScene(white, next, current);
      void engine.setScene(current);
    },
    setPointer(x, y) {
      current.setPointer(x, y);
    },
  };
}

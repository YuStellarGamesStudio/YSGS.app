import { Geometry, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'xyz.js';
import type { PBRMaterial } from 'xyz.js';

type Vec3 = [number, number, number];
/** Surface-of-revolution profile around the ship's long (X) axis, as [x, radius] points. */
type Profile = Array<[number, number]>;

export interface ShipMaterials {
  /** Textured plating for pressure hulls and tanks. */
  hull: PBRMaterial;
  /** Bare structure: truss, nozzles, masts and the dish. */
  metal: PBRMaterial;
  radiator: PBRMaterial;
  window: PBRMaterial;
  /** Nozzle throat, glowing white-hot. */
  engine: PBRMaterial;
  /** Exhaust: a soft outer plume and a hot inner core; transparent, faded by vertex alpha. */
  plume: PBRMaterial;
  exhaust: PBRMaterial;
  /** Sparks streaming out of the drive. */
  sparks: PBRMaterial;
  port: PBRMaterial;
  starboard: PBRMaterial;
  strobe: PBRMaterial;
}

export interface Ship {
  root: Group;
  /** Habitat ring; spins about the long axis for artificial gravity. */
  ring: Group;
  /** Anti-collision strobes, flashed by the caller. */
  strobes: Mesh[];
  /** Advances the exhaust sparks to `time` seconds; stateless, so any time can be shown. */
  updateExhaust(time: number): void;
}

// A realistic deep-space hauler, bow toward -X: command module, spinning habitat ring, open
// truss spine with propellant tanks and radiators, reactor section and a fusion drive.
const SEGMENTS = 24;
const RING_X = -1.55;
const RING_RADIUS = 1.15;
const RING_TUBE = 0.11;
const RING_WINDOWS = 40;
const SPINE_FROM = -0.9;
const SPINE_TO = 2.3;
const SPINE_HALF = 0.2;
const SPINE_BAYS = 8;
const NOZZLE_EXIT = 4.25;
const SPARK_COUNT = 48;
/** Seconds from leaving the nozzle to burning out. */
const SPARK_LIFE = 1.1;
/** Distance a spark of average speed travels over its life. */
const SPARK_TRAVEL = 2.8;
const SPARK_RADIUS = 0.035;

/**
 * Lathes `profile` around the X axis. Repeated points make a hard edge. `alpha`, one value per
 * profile point, adds vertex alpha (used to fade the plume).
 */
function lathe(profile: Profile, options: { segments?: number; uv?: [number, number]; alpha?: number[] } = {}): Geometry {
  const segments = options.segments ?? SEGMENTS;
  const [uRepeat, vRepeat] = options.uv ?? [1, 1];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const lengths = [0];
  for (let i = 1; i < profile.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(profile[i]![0] - profile[i - 1]![0], profile[i]![1] - profile[i - 1]![1]));
  const total = lengths[lengths.length - 1]! || 1;
  const same = (a: number, b: number): boolean => profile[a]![0] === profile[b]![0] && profile[a]![1] === profile[b]![1];
  profile.forEach(([x, r], i) => {
    // Tangent from the neighbours; at a repeated point, only from the side it belongs to.
    const prev = i > 0 && !same(i, i - 1) ? i - 1 : i;
    const next = i < profile.length - 1 && !same(i, i + 1) ? i + 1 : i;
    const dx = profile[next]![0] - profile[prev]![0];
    const dr = profile[next]![1] - profile[prev]![1];
    const length = Math.hypot(dx, dr) || 1;
    // Outward normal for a profile walked toward +X.
    const nx = -dr / length;
    const nr = dx / length;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      positions.push(x, r * cos, r * sin);
      normals.push(nx, nr * cos, nr * sin);
      uvs.push((lengths[i]! / total) * uRepeat, (s / segments) * vRepeat);
      if (options.alpha) colors.push(1, 1, 1, options.alpha[i]!);
    }
  });
  const row = segments + 1;
  for (let i = 0; i < profile.length - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * row + s;
      const b = a + row;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return new Geometry({ positions, normals, uvs, indices, ...(options.alpha ? { colors } : {}) });
}

/** Pressure vessel with hemispherical ends, from x0 to x1. */
function capsule(x0: number, x1: number, radius: number, steps = 5): Profile {
  const profile: Profile = [];
  for (let k = 0; k <= steps; k++) {
    const phi = (k / steps) * (Math.PI / 2);
    profile.push([x0 + radius - radius * Math.cos(phi), radius * Math.sin(phi)]);
  }
  for (let k = steps; k >= 0; k--) {
    const phi = (k / steps) * (Math.PI / 2);
    profile.push([x1 - radius + radius * Math.cos(phi), radius * Math.sin(phi)]);
  }
  return profile;
}

/** Ring tube around the X axis, walked so lathe() normals face out of the tube. */
function torus(x: number, radius: number, tube: number, steps = 12): Profile {
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = (k / steps) * Math.PI * 2;
    return [x + tube * Math.cos(t), radius - tube * Math.sin(t)];
  });
}

/** Rotation turning local +X toward the direction (dx, dy, dz). */
function aim(rotation: Quaternion, dx: number, dy: number, dz: number): Quaternion {
  const length = Math.hypot(dx, dy, dz) || 1;
  return rotation.setFromEuler(0, Math.atan2(-dz, dx), Math.asin(dy / length));
}

/** Instanced box beams; each entry runs from `from` to `to` with a square cross-section. */
function beams(material: PBRMaterial, list: Array<{ from: Vec3; to: Vec3; thickness: number }>): InstancedMesh {
  const mesh = new InstancedMesh({ geometry: Geometry.cube(1), material, count: list.length });
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const size = new Vector3();
  list.forEach(({ from, to, thickness }, i) => {
    const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    aim(rotation, ...d);
    mesh.setMatrixAt(i, matrix.compose(position, rotation, size.set(Math.hypot(...d), thickness, thickness)));
  });
  return mesh;
}

/** Instanced window lights on a hull of radius `radius` around X, at [x, angle] spots. */
function windows(material: PBRMaterial, radius: number, spots: Array<[number, number]>, size: Vec3): InstancedMesh {
  const mesh = new InstancedMesh({ geometry: Geometry.cube(1), material, count: spots.length });
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3(...size);
  spots.forEach(([x, angle], i) => {
    position.set(x, Math.cos(angle) * radius, Math.sin(angle) * radius);
    // Local +Z (the thin side) turned to face out along the radius.
    rotation.setFromEuler(angle - Math.PI / 2, 0, 0);
    mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
  });
  return mesh;
}

export function buildShip(m: ShipMaterials): Ship {
  const root = new Group();
  const lathed = (profile: Profile, material: PBRMaterial, uv?: [number, number]): Mesh => root.add(new Mesh({ geometry: lathe(profile, uv ? { uv } : {}), material }));

  // Command module: blunt nose, a shoulder and a collar onto the habitat hub.
  lathed(
    [
      [-4.1, 0],
      [-4.06, 0.12],
      [-3.92, 0.28],
      [-3.62, 0.42],
      [-3.2, 0.5],
      [-2.5, 0.5],
      [-2.5, 0.44],
      [-2.2, 0.44],
      [-2.2, 0.22],
    ],
    m.hull,
    [3, 4],
  );
  // A single row of bridge windows down each side.
  const bridge: Array<[number, number]> = [];
  for (const side of [1, -1]) for (let k = 0; k < 6; k++) bridge.push([-3.12 + k * 0.12, side * (Math.PI / 2) + 0.3]);
  root.add(windows(m.window, 0.505, bridge, [0.05, 0.035, 0.02]));

  // Habitat hub and spinning ring on three spokes.
  lathed(
    [
      [-2.2, 0.22],
      [-1.8, 0.22],
      [-1.8, 0.32],
      [-1.3, 0.32],
      [-1.3, 0.22],
      [SPINE_FROM, 0.22],
      [SPINE_FROM, 0],
    ],
    m.hull,
    [2, 3],
  );
  const ring = root.add(new Group());
  ring.position.x = RING_X;
  ring.add(new Mesh({ geometry: lathe(torus(0, RING_RADIUS, RING_TUBE), { segments: 64, uv: [1, 24] }), material: m.hull }));
  ring.add(
    beams(
      m.metal,
      [0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2;
        return { from: [0, Math.cos(a) * 0.32, Math.sin(a) * 0.32], to: [0, Math.cos(a) * (RING_RADIUS - RING_TUBE), Math.sin(a) * (RING_RADIUS - RING_TUBE)], thickness: 0.05 };
      }),
    ),
  );
  // Two rows of cabin windows on the ring's outer flanks; a few cabins are dark.
  const cabins: Array<[number, number]> = [];
  for (let k = 0; k < RING_WINDOWS; k++) {
    if (k % 7 === 3) continue;
    const a = (k / RING_WINDOWS) * Math.PI * 2;
    cabins.push([RING_TUBE * 0.45, a], [-RING_TUBE * 0.45, a]);
  }
  ring.add(windows(m.window, RING_RADIUS + RING_TUBE * 0.92, cabins, [0.035, 0.07, 0.02]));

  // Open truss spine: four longerons, a core pipe and diagonal bracing on every face.
  lathed([[SPINE_FROM, 0.07], [SPINE_TO, 0.07]], m.metal);
  const truss: Array<{ from: Vec3; to: Vec3; thickness: number }> = [];
  const corners: Array<[number, number]> = [
    [SPINE_HALF, SPINE_HALF],
    [-SPINE_HALF, SPINE_HALF],
    [-SPINE_HALF, -SPINE_HALF],
    [SPINE_HALF, -SPINE_HALF],
  ];
  for (const [y, z] of corners) truss.push({ from: [SPINE_FROM, y, z], to: [SPINE_TO, y, z], thickness: 0.035 });
  const bay = (SPINE_TO - SPINE_FROM) / SPINE_BAYS;
  for (let b = 0; b < SPINE_BAYS; b++) {
    const x = SPINE_FROM + b * bay;
    corners.forEach(([y, z], c) => {
      const [ny, nz] = corners[(c + 1) % 4]!;
      // Alternating diagonals read as a Warren truss.
      truss.push(b % 2 ? { from: [x, y, z], to: [x + bay, ny, nz], thickness: 0.018 } : { from: [x + bay, y, z], to: [x, ny, nz], thickness: 0.018 });
      truss.push({ from: [x, y, z], to: [x, ny, nz], thickness: 0.022 });
    });
  }
  root.add(beams(m.metal, truss));

  // Propellant tanks on the faces of the forward spine, clear of the corner longerons.
  const tank = lathe(capsule(-0.75, 0.75, 0.2), { segments: 16, uv: [2, 2] });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    root.add(new Mesh({ geometry: tank, material: m.hull, position: [0, Math.cos(a) * 0.43, Math.sin(a) * 0.43] }));
  }

  // Radiator wings above and below the aft spine, each two panels on a boom.
  for (const side of [1, -1]) {
    root.add(beams(m.metal, [{ from: [1.55, side * SPINE_HALF, 0], to: [1.55, side * 1.75, 0], thickness: 0.04 }]));
    for (const [x, width] of [[1.18, 0.68], [1.92, 0.68]] as const) {
      root.add(new Mesh({ geometry: Geometry.cube(1), material: m.radiator, position: [x, side * 1.0, 0], scale: [width, 1.45, 0.018] }));
    }
  }

  // Reactor and drive section.
  lathed(
    [
      [SPINE_TO, 0],
      [SPINE_TO, 0.26],
      [2.45, 0.5],
      [3.1, 0.56],
      [3.3, 0.5],
      [3.3, 0.36],
      [3.42, 0.3],
      [3.42, 0],
    ],
    m.hull,
    [2, 4],
  );
  // Shield ribs around the reactor.
  for (const x of [2.62, 2.86]) root.add(new Mesh({ geometry: lathe([[x - 0.03, 0.555], [x - 0.03, 0.6], [x + 0.03, 0.6], [x + 0.03, 0.555]]), material: m.metal }));
  // Main drive: a bell nozzle, its white-hot throat and a fading exhaust plume.
  root.add(
    new Mesh({
      geometry: lathe([
        [3.42, 0.16],
        [3.55, 0.2],
        [3.8, 0.29],
        [4.05, 0.38],
        [NOZZLE_EXIT, 0.43],
      ]),
      material: m.metal,
    }),
  );
  root.add(new Mesh({ geometry: lathe([[3.5, 0.19], [3.5, 0]]), material: m.engine }));
  root.add(new Mesh({ geometry: lathe([[NOZZLE_EXIT, 0.4], [4.7, 0.42], [5.6, 0.36], [7, 0.16]], { alpha: [0.22, 0.15, 0.05, 0] }), material: m.plume }));
  root.add(new Mesh({ geometry: lathe([[3.6, 0.17], [NOZZLE_EXIT, 0.15], [5, 0.09], [5.9, 0.02]], { alpha: [0.9, 0.7, 0.3, 0] }), material: m.exhaust }));

  // Comms mast and high-gain dish on the command module's dorsal side.
  root.add(beams(m.metal, [{ from: [-2.85, 0.45, 0], to: [-2.85, 0.95, 0], thickness: 0.035 }]));
  const dish = root.add(new Mesh({ geometry: lathe([[0, 0], [0.03, 0.12], [0.08, 0.2], [0.14, 0.27]], { segments: 20 }), material: m.metal, position: [-2.85, 0.97, 0] }));
  aim(dish.rotation, -0.6, 1, 0.4);
  // Whip antennas off the bow.
  root.add(
    beams(m.metal, [
      { from: [-3.7, 0.3, 0.2], to: [-4.5, 0.42, 0.28], thickness: 0.012 },
      { from: [-3.7, -0.3, -0.2], to: [-4.4, -0.4, -0.3], thickness: 0.012 },
    ]),
  );

  // Navigation lights: red to port (+Z, with the bow toward -X), green to starboard, white strobes.
  const light = (material: PBRMaterial, position: Vec3, radius = 0.035): Mesh => root.add(new Mesh({ geometry: Geometry.sphere(radius, 8, 6), material, position }));
  light(m.port, [2.74, 0, 0.6]);
  light(m.starboard, [2.74, 0, -0.6]);
  const strobes = [light(m.strobe, [-4.12, 0, 0], 0.04), light(m.strobe, [1.55, 1.78, 0]), light(m.strobe, [1.55, -1.78, 0])];

  // Exhaust sparks: each one loops on its own phase, speed and heading, widening as it flies
  // aft and shrinking away as it cools. Low-discrepancy sequences spread them without an RNG.
  const sparks = root.add(new InstancedMesh({ geometry: Geometry.sphere(1, 6, 4), material: m.sparks, count: SPARK_COUNT }));
  const fract = (v: number): number => v - Math.floor(v);
  const sparkSeeds = Array.from({ length: SPARK_COUNT }, (_, i) => ({
    phase: fract(i * 0.618034),
    speed: 0.7 + fract(i * 0.754878) * 0.6,
    spread: fract(i * 0.569840),
    angle: i * 2.399963,
  }));
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const updateExhaust = (time: number): void => {
    sparkSeeds.forEach(({ phase, speed, spread, angle }, i) => {
      const age = fract(time / SPARK_LIFE + phase);
      const r = spread * (0.06 + age * 0.3);
      const size = Math.max(1e-3, SPARK_RADIUS * (1 - age) * (0.5 + spread * 0.5));
      position.set(NOZZLE_EXIT - 0.1 + age * SPARK_TRAVEL * speed, Math.cos(angle) * r, Math.sin(angle) * r);
      sparks.setMatrixAt(i, matrix.compose(position, rotation, scale.set(size, size, size)));
    });
  };
  updateExhaust(0);

  return { root, ring, strobes, updateExhaust };
}

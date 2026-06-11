import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { Pane } from 'tweakpane';

type Vec3 = [number, number, number];
type ShapeName =
  | 'sphere'
  | 'box'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'torusKnot'
  | 'icosahedron'
  | 'octahedron';

const config = {
  shape: 'sphere' as ShapeName,
  showShape: true,
  resolution: 2,
  guides: true,
  arrowLength: 0.2,
  headLength: 0.02,
  dotRadius: 0.01,
  jitter: 0.005,
  strokeAlpha: 1,
  paper: '#f8f5ee',
  graphite: '#2b2b2b',
  shapeTone: '#8a8a8a',
  guideTone: '#c2bdb2',
};

const pane = new Pane() as any;
if (pane.containerElem_) pane.containerElem_.style.zIndex = '1';

pane.addBinding(config, 'shape', {
  options: {
    sphere: 'sphere',
    box: 'box',
    cylinder: 'cylinder',
    cone: 'cone',
    torus: 'torus',
    'torus knot': 'torusKnot',
    icosahedron: 'icosahedron',
    octahedron: 'octahedron',
  },
});
pane.addBinding(config, 'showShape');
pane.addBinding(config, 'resolution', { min: 1, max: 5, step: 1 });
pane.addBinding(config, 'guides');
pane.addBinding(config, 'arrowLength', { min: 0.1, max: 1, step: 0.01 });
pane.addBinding(config, 'headLength', { min: 0.02, max: 0.2, step: 0.005 });
pane.addBinding(config, 'dotRadius', { min: 0, max: 0.03, step: 0.001 });
pane.addBinding(config, 'jitter', { min: 0, max: 0.04, step: 0.001 });
pane.addBinding(config, 'strokeAlpha', { min: 0.1, max: 1, step: 0.01 });
pane.addBinding(config, 'paper');
pane.addBinding(config, 'graphite');
pane.addBinding(config, 'shapeTone');
pane.addBinding(config, 'guideTone');

const CAMERA_DISTANCE = 5.4;
const CAMERA_HEIGHT = 1.4;
const STROKE_PASSES = 2;

/**
 * The electromagnetic field tensor: a 4x4 antisymmetric matrix over (t, x, y, z).
 * Electric field components fill the first row (negated in the first column),
 * the magnetic field fills the spatial block. For a particle with four-velocity
 * u = (1, v), the force is the weighted sum of rows f_j = Σ_i u_i F_ij — its
 * spatial part works out to the Lorentz force E + v × B.
 */
const emTensor = (E: Vec3, B: Vec3) => {
  const [ex, ey, ez] = E;
  const [bx, by, bz] = B;
  return [
    [0, ex, ey, ez],
    [-ex, 0, -bz, by],
    [-ey, bz, 0, -bx],
    [-ez, -by, bx, 0],
  ];
};

const forceAt = (F: number[][], v: THREE.Vector3) => {
  const u = [1, v.x, v.y, v.z];
  const f = [0, 0, 0, 0];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) f[j] += u[i] * F[i][j];
  }
  return new THREE.Vector3(f[1], f[2], f[3]);
};

// Primitives sized so each shape fills roughly the same ~unit-radius volume.
const shapeGeometry = (shape: ShapeName): THREE.BufferGeometry => {
  switch (shape) {
    case 'sphere':
      return new THREE.IcosahedronGeometry(1, 3);
    case 'box':
      return new THREE.BoxGeometry(1.5, 1.5, 1.5, 5, 5, 5);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.85, 0.85, 1.7, 28, 8);
    case 'cone':
      return new THREE.ConeGeometry(1, 1.7, 28, 8);
    case 'torus':
      return new THREE.TorusGeometry(0.85, 0.35, 12, 36);
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(0.7, 0.22, 96, 10);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(1.1, 1);
    case 'octahedron':
      return new THREE.OctahedronGeometry(1.2, 1);
  }
};

// Separate from the sampling geometry so wireframe density is tuneable —
// `resolution` (1–5) scales each shape's segment counts.
const wireframeSource = (
  shape: ShapeName,
  resolution: number,
): THREE.BufferGeometry => {
  switch (shape) {
    case 'sphere':
      return new THREE.IcosahedronGeometry(1, resolution - 1);
    case 'box':
      return new THREE.BoxGeometry(1.5, 1.5, 1.5);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        0.85,
        0.85,
        1.7,
        6 * resolution,
        resolution,
      );
    case 'cone':
      return new THREE.ConeGeometry(1, 1.7, 6 * resolution, resolution);
    case 'torus':
      return new THREE.TorusGeometry(
        0.85,
        0.35,
        4 + 2 * resolution,
        8 * resolution,
      );
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(
        0.7,
        0.22,
        24 * resolution,
        3 * resolution,
      );
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(1.1, Math.max(0, resolution - 2));
    case 'octahedron':
      return new THREE.OctahedronGeometry(1.2, Math.max(0, resolution - 2));
  }
};

// Unique vertices of a geometry — primitives duplicate vertices along seams
// and face boundaries, so dedupe by rounded position.
const surfacePoints = (geometry: THREE.BufferGeometry): THREE.Vector3[] => {
  const position = geometry.getAttribute('position');
  const seen = new Set<string>();
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(p);
  }
  return points;
};

const perpendicularBasis = (
  dir: THREE.Vector3,
): [THREE.Vector3, THREE.Vector3] => {
  const ref =
    Math.abs(dir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  return [u, v];
};

// All pencil strokes accumulate into one buffer rendered as LineSegments
// with per-vertex rgba — overlapping translucent passes build up graphite.
interface StrokeBuffer {
  positions: number[];
  colors: number[];
}

const addSegments = (
  buffer: StrokeBuffer,
  points: THREE.Vector3[],
  color: THREE.Color,
  alpha: number,
) => {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    buffer.positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    buffer.colors.push(
      color.r,
      color.g,
      color.b,
      alpha,
      color.r,
      color.g,
      color.b,
      alpha,
    );
  }
};

// A straight line redrawn as a slightly wobbly polyline; endpoints wobble
// half as much so arrow tips stay anchored.
const pencilLine = (
  a: THREE.Vector3,
  b: THREE.Vector3,
  segments: number,
  jitter: number,
): THREE.Vector3[] => {
  const dir = b.clone().sub(a).normalize();
  const [u, v] = perpendicularBasis(dir);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const wobble = i === 0 || i === segments ? jitter * 0.5 : jitter;
    const p = a.clone().lerp(b, t);
    p.addScaledVector(u, Random.range(-wobble, wobble));
    p.addScaledVector(v, Random.range(-wobble, wobble));
    points.push(p);
  }
  return points;
};

const pencilArrow = (
  buffer: StrokeBuffer,
  base: THREE.Vector3,
  heading: THREE.Vector3,
  length: number,
  color: THREE.Color,
  alpha: number,
) => {
  const tip = base.clone().addScaledVector(heading, length);
  for (let pass = 0; pass < STROKE_PASSES; pass++) {
    addSegments(buffer, pencilLine(base, tip, 4, config.jitter), color, alpha);
  }

  // V-shaped barbs drawn in a randomly rolled plane, like a quick hand stroke.
  const [u, v] = perpendicularBasis(heading);
  const roll = Random.range(0, Math.PI * 2);
  const side = u
    .clone()
    .multiplyScalar(Math.cos(roll))
    .addScaledVector(v, Math.sin(roll));
  const barb = Math.min(config.headLength, length * 0.6);
  for (const s of [1, -1]) {
    const end = tip
      .clone()
      .addScaledVector(heading, -barb)
      .addScaledVector(side, s * barb * 0.45);
    for (let pass = 0; pass < STROKE_PASSES; pass++) {
      addSegments(
        buffer,
        pencilLine(tip, end, 2, config.jitter * 0.7),
        color,
        alpha,
      );
    }
  }
};

// A dot drawn as a tiny scribbled ring in the plane tangent to `normal` —
// two offset passes overlap like a pencil circling the same spot.
const pencilDot = (
  buffer: StrokeBuffer,
  center: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  color: THREE.Color,
  alpha: number,
) => {
  const [u, v] = perpendicularBasis(normal);
  const segments = 10;
  for (let pass = 0; pass < STROKE_PASSES; pass++) {
    const r = radius * Random.range(0.75, 1.25);
    const start = Random.range(0, Math.PI * 2);
    const wobble = radius * 0.25;
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = start + (i / segments) * Math.PI * 2;
      const p = center
        .clone()
        .addScaledVector(u, Math.cos(angle) * r + Random.range(-wobble, wobble))
        .addScaledVector(
          v,
          Math.sin(angle) * r + Random.range(-wobble, wobble),
        );
      ring.push(p);
    }
    addSegments(buffer, ring, color, alpha);
  }
};

const strokeGeometry = (buffer: StrokeBuffer): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(buffer.positions, 3),
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(buffer.colors, 4),
  );
  return geometry;
};

interface FieldMaterials {
  stroke: THREE.LineBasicMaterial;
}

// The shape itself, drawn as pencil-stroke wireframe edges — outlines only.
const buildWireframe = (materials: FieldMaterials): THREE.LineSegments => {
  const buffer: StrokeBuffer = { positions: [], colors: [] };
  const tone = new THREE.Color(config.shapeTone);
  const source = wireframeSource(config.shape, config.resolution);
  const edges = new THREE.EdgesGeometry(source, 1);
  const position = edges.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 2) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    addSegments(buffer, pencilLine(a, b, 3, config.jitter * 0.6), tone, 0.4);
  }
  edges.dispose();
  source.dispose();
  const wire = new THREE.LineSegments(strokeGeometry(buffer), materials.stroke);
  wire.visible = config.showShape;
  return wire;
};

// Build the occluding shape plus pencil-stroke force arrows at its vertices.
// Each vertex direction (normalized position) is treated as the velocity
// fed through the tensor — on the sphere this matches the original sketch.
const buildField = (F: number[][], materials: FieldMaterials): THREE.Group => {
  const surface = shapeGeometry(config.shape);
  const points = surfacePoints(surface);
  const forces = points.map((p) => forceAt(F, p.clone().normalize()));
  const maxForce = Math.max(...forces.map((f) => f.length())) || 1;

  const buffer: StrokeBuffer = { positions: [], colors: [] };
  const graphite = new THREE.Color(config.graphite);
  // Pencil-pressure fade target stays well darker than the shape tone so
  // arrows and dots always read as the darkest layer.
  const faded = new THREE.Color('#777777');
  const tone = new THREE.Color();

  points.forEach((base, i) => {
    tone.copy(graphite).lerp(faded, Random.range(0, 0.3));
    pencilDot(
      buffer,
      base,
      base.clone().normalize(),
      config.dotRadius * Random.range(0.7, 1.3),
      tone,
      config.strokeAlpha,
    );

    const force = forces[i];
    const length = mapRange(force.length(), 0, maxForce, 0, config.arrowLength);
    if (length < 0.02) return; // degenerate arrow — keep only the dot

    // Lighter pencil pressure on weaker forces, plus hand variation.
    const lightness =
      (1 - length / config.arrowLength) * 0.35 + Random.range(0, 0.2);
    tone.copy(graphite).lerp(faded, lightness);

    const heading = force.clone().normalize();
    pencilArrow(buffer, base, heading, length, tone, config.strokeAlpha);
  });

  const strokes = new THREE.LineSegments(
    strokeGeometry(buffer),
    materials.stroke,
  );

  surface.dispose();

  const wire = buildWireframe(materials);

  const group = new THREE.Group();
  group.add(wire, strokes);
  return group;
};

// Faint construction geometry around the form — wobbly circles and small
// cross marks, like the underdrawing in the reference.
const buildGuides = (materials: FieldMaterials): THREE.LineSegments => {
  const buffer: StrokeBuffer = { positions: [], colors: [] };
  const tone = new THREE.Color(config.guideTone);

  for (let c = 0; c < 3; c++) {
    const radius = Random.range(1.15, 1.5);
    const orientation = new THREE.Quaternion().fromArray(Random.quaternion());
    const segments = 72;
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const p = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0,
      ).applyQuaternion(orientation);
      p.x += Random.range(-0.008, 0.008);
      p.y += Random.range(-0.008, 0.008);
      p.z += Random.range(-0.008, 0.008);
      ring.push(p);
    }
    addSegments(buffer, ring, tone, 0.3);
  }

  for (let m = 0; m < 4; m++) {
    const p = new THREE.Vector3(
      ...(Random.onSphere(Random.range(1.5, 1.8)) as Vec3),
    );
    const [u, v] = perpendicularBasis(p.clone().normalize());
    const size = 0.045;
    addSegments(
      buffer,
      pencilLine(
        p.clone().addScaledVector(u, -size),
        p.clone().addScaledVector(u, size),
        2,
        0.004,
      ),
      tone,
      0.45,
    );
    addSegments(
      buffer,
      pencilLine(
        p.clone().addScaledVector(v, -size),
        p.clone().addScaledVector(v, size),
        2,
        0.004,
      ),
      tone,
      0.45,
    );
  }

  const guides = new THREE.LineSegments(
    strokeGeometry(buffer),
    materials.stroke,
  );
  guides.visible = config.guides;
  return guides;
};

const disposeField = (group: THREE.Object3D) => {
  group.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry;
    if (geometry) geometry.dispose();
  });
};

const sketch: Sketch<'webgl2'> = ({
  wrap,
  canvas,
  width,
  height,
  pixelRatio,
  ...props
}) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('seed:', seed);

  // Pick a tensor archetype rather than 16 raw numbers — every pick stays a
  // valid (antisymmetric) electromagnetic tensor with a readable field shape.
  const kind = Random.pick(['electric', 'magnetic', 'mixed']);
  const zero: Vec3 = [0, 0, 0];
  const E =
    kind === 'magnetic'
      ? zero
      : (Random.onSphere(Random.range(0.5, 1)) as Vec3);
  const B =
    kind === 'electric'
      ? zero
      : (Random.onSphere(Random.range(0.5, 1)) as Vec3);
  const F = emTensor(E, B);
  console.log('tensor:', kind, { E, B });

  // ssam already created the WebGL2 context (settings.attributes); three.js adopts it
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(new THREE.Color(config.paper), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  const controls = new TrackballControls(camera, canvas);
  controls.rotateSpeed = 3;

  const materials: FieldMaterials = {
    stroke: new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
    }),
  };

  let field = buildField(F, materials);
  let guides = buildGuides(materials);
  scene.add(field, guides);

  pane.on('change', () => {
    renderer.setClearColor(new THREE.Color(config.paper), 1);
    scene.remove(field, guides);
    disposeField(field);
    disposeField(guides);
    field = buildField(F, materials);
    guides = buildGuides(materials);
    scene.add(field, guides);
  });

  wrap.render = () => {
    controls.update();
    renderer.render(scene, camera);
  };
};

export const settings: SketchSettings = {
  mode: 'webgl2',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  // preserveDrawingBuffer so exportFrame can read pixels outside the draw tick
  attributes: { antialias: true, preserveDrawingBuffer: true },
  animate: true,
  duration: 8000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch, settings);

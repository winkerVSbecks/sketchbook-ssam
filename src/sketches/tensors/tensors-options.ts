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
  arrowLength: 0.55,
  shaftRadius: 0.006,
  headLength: 0.09,
  headRadius: 0.024,
  dotRadius: 0.011,
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
pane.addBinding(config, 'arrowLength', { min: 0.1, max: 1, step: 0.01 });
pane.addBinding(config, 'shaftRadius', { min: 0.002, max: 0.02, step: 0.001 });
pane.addBinding(config, 'headLength', { min: 0.02, max: 0.2, step: 0.005 });
pane.addBinding(config, 'headRadius', { min: 0.005, max: 0.06, step: 0.001 });
pane.addBinding(config, 'dotRadius', { min: 0, max: 0.03, step: 0.001 });

const CAMERA_DISTANCE = 5.4;
const CAMERA_HEIGHT = 1.4;

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

interface FieldMaterials {
  black: THREE.MeshBasicMaterial;
  shell: THREE.MeshBasicMaterial;
}

// Build the occluding shape plus instanced force arrows at its vertices.
// Each vertex direction (normalized position) is treated as the velocity
// fed through the tensor — on the sphere this matches the original sketch.
const buildField = (F: number[][], materials: FieldMaterials): THREE.Group => {
  const surface = shapeGeometry(config.shape);
  const points = surfacePoints(surface);
  const forces = points.map((p) => forceAt(F, p.clone().normalize()));
  const maxForce = Math.max(...forces.map((f) => f.length())) || 1;

  const shaftGeometry = new THREE.CylinderGeometry(config.shaftRadius, config.shaftRadius, 1, 6);
  shaftGeometry.translate(0, 0.5, 0); // base at origin, unit length along +y
  const headGeometry = new THREE.ConeGeometry(config.headRadius, config.headLength, 12);
  headGeometry.translate(0, config.headLength / 2, 0);
  const dotGeometry = new THREE.SphereGeometry(config.dotRadius, 8, 8);

  const count = points.length;
  const shafts = new THREE.InstancedMesh(shaftGeometry, materials.black, count);
  const heads = new THREE.InstancedMesh(headGeometry, materials.black, count);
  const dots = new THREE.InstancedMesh(dotGeometry, materials.black, count);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const noRotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  points.forEach((base, i) => {
    matrix.compose(base, noRotation, scale.set(1, 1, 1));
    dots.setMatrixAt(i, matrix);

    const force = forces[i];
    const length = mapRange(force.length(), 0, maxForce, 0, config.arrowLength);
    if (length < 0.02) {
      // Degenerate arrow (velocity parallel to B) — keep only the dot.
      matrix.compose(base, noRotation, scale.set(0.0001, 0.0001, 0.0001));
      shafts.setMatrixAt(i, matrix);
      heads.setMatrixAt(i, matrix);
      return;
    }

    const heading = force.clone().normalize();
    quaternion.setFromUnitVectors(up, heading);

    // Shrink the head on short arrows so they taper instead of becoming blobs.
    const headScale = Math.min(1, length / (config.headLength * 2));
    const shaftLength = Math.max(length - config.headLength * headScale, 0.0001);

    matrix.compose(base, quaternion, scale.set(1, shaftLength, 1));
    shafts.setMatrixAt(i, matrix);

    const headBase = base.clone().addScaledVector(heading, shaftLength);
    matrix.compose(headBase, quaternion, scale.set(headScale, headScale, headScale));
    heads.setMatrixAt(i, matrix);
  });

  // Slightly recessed opaque shape so arrows on the far side are occluded.
  const occluder = new THREE.Mesh(surface, materials.shell);
  occluder.scale.setScalar(0.995);
  occluder.visible = config.showShape;

  const group = new THREE.Group();
  group.add(occluder, shafts, heads, dots);
  return group;
};

const disposeField = (group: THREE.Group) => {
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).geometry.dispose();
  });
};

const sketch: Sketch<'webgl2'> = ({ wrap, canvas, width, height, pixelRatio, ...props }) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('seed:', seed);

  // Pick a tensor archetype rather than 16 raw numbers — every pick stays a
  // valid (antisymmetric) electromagnetic tensor with a readable field shape.
  const kind = Random.pick(['electric', 'magnetic', 'mixed']);
  const zero: Vec3 = [0, 0, 0];
  const E = kind === 'magnetic' ? zero : (Random.onSphere(Random.range(0.5, 1)) as Vec3);
  const B = kind === 'electric' ? zero : (Random.onSphere(Random.range(0.5, 1)) as Vec3);
  const F = emTensor(E, B);
  console.log('tensor:', kind, { E, B });

  // ssam already created the WebGL2 context (settings.attributes); three.js adopts it
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0xffffff, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  const controls = new TrackballControls(camera, canvas);
  controls.rotateSpeed = 3;

  const materials: FieldMaterials = {
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    shell: new THREE.MeshBasicMaterial({ color: 0xf4f4f4 }),
  };

  let field = buildField(F, materials);
  scene.add(field);

  pane.on('change', () => {
    scene.remove(field);
    disposeField(field);
    field = buildField(F, materials);
    scene.add(field);
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

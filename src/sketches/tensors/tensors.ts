import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import * as THREE from 'three';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';

type Vec3 = [number, number, number];

const SPHERE_RADIUS = 1;
const SAMPLE_COUNT = 320;
const MAX_ARROW_LENGTH = 0.55;
const SHAFT_RADIUS = 0.006;
const HEAD_LENGTH = 0.09;
const HEAD_RADIUS = 0.024;
const DOT_RADIUS = 0.011;
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

const fibonacciSphere = (count: number) => {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const directions: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    directions.push(
      new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius)
    );
  }
  return directions;
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

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0xffffff, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);

  // Sample velocities on the unit sphere and map each through the tensor.
  const directions = fibonacciSphere(SAMPLE_COUNT);
  const forces = directions.map((v) => forceAt(F, v));
  const maxForce = Math.max(...forces.map((f) => f.length())) || 1;

  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });

  const shaftGeometry = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, 1, 6);
  shaftGeometry.translate(0, 0.5, 0); // base at origin, unit length along +y
  const headGeometry = new THREE.ConeGeometry(HEAD_RADIUS, HEAD_LENGTH, 12);
  headGeometry.translate(0, HEAD_LENGTH / 2, 0);
  const dotGeometry = new THREE.SphereGeometry(DOT_RADIUS, 8, 8);

  const shafts = new THREE.InstancedMesh(shaftGeometry, black, SAMPLE_COUNT);
  const heads = new THREE.InstancedMesh(headGeometry, black, SAMPLE_COUNT);
  const dots = new THREE.InstancedMesh(dotGeometry, black, SAMPLE_COUNT);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const noRotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  directions.forEach((direction, i) => {
    const base = direction.clone().multiplyScalar(SPHERE_RADIUS);
    matrix.compose(base, noRotation, scale.set(1, 1, 1));
    dots.setMatrixAt(i, matrix);

    const force = forces[i];
    const length = mapRange(force.length(), 0, maxForce, 0, MAX_ARROW_LENGTH);
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
    const headScale = Math.min(1, length / (HEAD_LENGTH * 2));
    const shaftLength = Math.max(length - HEAD_LENGTH * headScale, 0.0001);

    matrix.compose(base, quaternion, scale.set(1, shaftLength, 1));
    shafts.setMatrixAt(i, matrix);

    const headBase = base.clone().addScaledVector(heading, shaftLength);
    matrix.compose(headBase, quaternion, scale.set(headScale, headScale, headScale));
    heads.setMatrixAt(i, matrix);
  });

  // Slightly recessed opaque sphere so arrows on the far side are occluded.
  const occluder = new THREE.Mesh(
    new THREE.SphereGeometry(SPHERE_RADIUS * 0.995, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0xf4f4f4 })
  );

  scene.add(occluder, shafts, heads, dots);

  wrap.render = ({ playhead }) => {
    const angle = playhead * Math.PI * 2;
    camera.position.set(
      Math.sin(angle) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      Math.cos(angle) * CAMERA_DISTANCE
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
};

export const settings: SketchSettings = {
  mode: 'webgl2',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch, settings);

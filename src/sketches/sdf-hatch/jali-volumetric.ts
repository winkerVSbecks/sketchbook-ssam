import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../colors/riso';

/**
 * A jali window in volumetric light — sdf-hatch/jali-shafts without the
 * hatching. The same SDF room (a wall with a pointed-arch opening, a moulded
 * frame and a stone screen pierced by jali/truchet.ts's stepped-diagonal
 * tiles) is shaded straight to the canvas.
 *
 * The sun is outside. Each camera ray marches the room's air and sums the
 * sunlit length along it (single scattering); sun visibility is analytic —
 * follow the sun direction to the wall's faces and the screen's mid-plane and
 * look the arch and lattice up there — so the shafts and the light pooled on
 * the floor carry the truchet pattern exactly. Light is exposed and mapped
 * onto a two-tone ramp from the palette's ink to its paper.
 */

interface Config {
  seed: number;
  cells: number;
  barWidth: number;
  archRise: number;
  lightAngle: number;
  lightHeight: number;
  camAngle: number;
  density: number;
  exposure: number;
}

const config: Config = {
  seed: 7,
  // truchet cells across the opening
  cells: 8,
  // bar half width, in cells
  barWidth: 0.07,
  // height of the arch's point above the springing line, in half widths
  archRise: 1.5,
  lightAngle: 0.12,
  lightHeight: 0.95,
  camAngle: 0.15,
  // in-scattered light per world unit of sunlit air
  density: 0.9,
  exposure: 1.4,
};

const VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec3 uLightDir;
uniform float uCamAngle;
uniform float uSeed;
uniform float uCells;
uniform float uBar;
uniform float uRise;
uniform float uDensity;
uniform float uExposure;
uniform vec3 uPaper;
uniform vec3 uInk;

out vec4 outColor;

const float FOCAL = 2.2;
const float TMAX = 40.0;

// The room side of the wall is its z = 0 face; the sun is outside (z < 0).
const float WALL = 0.36;     // wall thickness
const float HALF_W = 0.85;   // half width of the opening
const float SILL = 0.7;      // sill height
const float SPRING = 2.1;    // where the arch springs
const float SCREEN = 0.05;   // half thickness of the jali screen
const float FRAME_W = 0.14;  // moulding width
const float FRAME_D = 0.06;  // moulding projection into the room

// The four stepped-diagonal truchet tiles of jali/truchet.ts on a 4×4
// sub-grid, 7 points each, flattened.
const vec2 TILES[28] = vec2[28](
  vec2(0, 4), vec2(1, 3), vec2(1, 2), vec2(2, 2), vec2(3, 2), vec2(3, 1), vec2(4, 0),
  vec2(0, 0), vec2(1, 1), vec2(2, 1), vec2(2, 2), vec2(2, 3), vec2(3, 3), vec2(4, 4),
  vec2(0, 4), vec2(1, 3), vec2(2, 3), vec2(2, 2), vec2(2, 1), vec2(3, 1), vec2(4, 0),
  vec2(0, 0), vec2(1, 1), vec2(1, 2), vec2(2, 2), vec2(3, 2), vec2(3, 3), vec2(4, 4)
);

// camera
vec3 ro, cu, cv, cw;

void setupCamera() {
  vec3 ta = vec3(0.0, 1.25, 0.0);
  ro = ta + vec3(sin(uCamAngle) * 6.0, 1.9, cos(uCamAngle) * 6.0);
  cw = normalize(ta - ro);
  cu = normalize(cross(cw, vec3(0.0, 1.0, 0.0)));
  cv = cross(cu, cw);
}

float hash(vec2 id) {
  return fract(sin(dot(id, vec2(127.1, 311.7)) + uSeed * 17.13) * 43758.5453);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdBox2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Extrude a 2D distance d2 through z ∈ [-h, h].
float extrude(float d2, float z, float h) {
  vec2 w = vec2(d2, abs(z) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

// Pointed arch: a box from the sill to the springing line, capped by the lens
// of two discs whose centres sit c either side of the axis. uRise is the
// height of the point above the springing line, in half widths.
float sdArch(vec2 p) {
  p.x = abs(p.x);
  float c = 0.5 * (uRise * uRise - 1.0) * HALF_W;
  // for x ≥ 0 the disc centred left of the axis is the one that binds
  float lens = max(length(p - vec2(-c, SPRING)) - (HALF_W + c), SILL - p.y);
  float box = sdBox2(p - vec2(0.0, 0.5 * (SILL + SPRING)), vec2(HALF_W, 0.5 * (SPRING - SILL)));
  return min(box, lens);
}

// Distance to the centre line of one cell's tile, f in sub-grid units (0..4).
float sdTile(vec2 f, vec2 id) {
  int t = int(floor(hash(id) * 4.0)) * 7;
  float d = 1e9;
  for (int i = 0; i < 6; i++) d = min(d, sdSegment(f, TILES[t + i], TILES[t + i + 1]));
  return d;
}

// The truchet bars, laid out from the bottom-left corner of the opening.
// A bar is thinner than half a cell, so the own cell plus the three nearest
// neighbours are enough for an exact distance.
float sdLattice(vec2 p) {
  float cell = 2.0 * HALF_W / uCells;
  vec2 q = (p - vec2(-HALF_W, SILL)) / cell;
  vec2 id = floor(q);
  vec2 f = q - id;
  vec2 nb = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
  float d = sdTile(f * 4.0, id);
  d = min(d, sdTile((f - vec2(nb.x, 0.0)) * 4.0, id + vec2(nb.x, 0.0)));
  d = min(d, sdTile((f - vec2(0.0, nb.y)) * 4.0, id + vec2(0.0, nb.y)));
  d = min(d, sdTile((f - nb) * 4.0, id + nb));
  return (d * 0.25 - uBar) * cell;
}

vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

// .x = distance, .y = object id (0 is reserved for "no hit")
vec2 map(vec3 p) {
  float arch = sdArch(p.xy);

  // room floor, ending under the wall so the holes look out onto sky
  vec2 res = vec2(max(p.y, -(p.z + WALL)), 1.0);

  float wall = max(abs(p.z + 0.5 * WALL) - 0.5 * WALL, -arch);
  res = opU(res, vec2(wall, 2.0));

  float band = max(-arch, arch - FRAME_W);
  float frame = extrude(band + 0.01, p.z - 0.5 * FRAME_D + 0.01, 0.5 * FRAME_D + 0.01) - 0.01;
  res = opU(res, vec2(frame, 3.0));

  // the screen overlaps the reveal slightly so the bars run into the stone
  float zs = p.z + 0.5 * WALL;
  float bound = max(abs(zs) - SCREEN, arch - 0.02);
  float screen = bound > 0.1 ? bound : extrude(max(sdLattice(p.xy), arch - 0.02), zs, SCREEN);
  res = opU(res, vec2(screen, 4.0));
  return res;
}

vec2 raymarch(vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 256; i++) {
    vec2 h = map(ro + rd * t);
    if (abs(h.x) < 0.0004 * t) return vec2(t, h.y);
    t += h.x;
    if (t > TMAX) break;
  }
  return vec2(TMAX, 0.0);
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0005;
  return normalize(
    e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
    e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x
  );
}

// sharp penumbra so the lattice's light lands on the floor legibly
float softShadow(vec3 p, vec3 l) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 128; i++) {
    float h = map(p + l * t).x;
    res = min(res, 64.0 * h / t);
    t += clamp(h, 0.005, 0.2);
    if (res < 0.001 || t > 8.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.12 * float(i) / 4.0;
    occ += (h - map(p + n * h).x) * sca;
    sca *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// Can a point on the room side see the sun? The only occluder is the wall,
// so instead of marching a shadow ray, follow the sun direction to the wall's
// two faces (the reveal) and the screen's mid-plane and look the opening and
// the lattice up there. Soft by a few millimetres to keep edges from aliasing.
float sunVisible(vec3 q) {
  if (q.z < -0.5 * WALL || q.y < 0.0) return 0.0;
  float face = smoothstep(0.0, 0.006, -sdArch(q.xy - uLightDir.xy * q.z / uLightDir.z));
  if (face == 0.0) return 0.0;
  vec2 back = q.xy + uLightDir.xy * (-WALL - q.z) / uLightDir.z;
  float open = face * smoothstep(0.0, 0.006, -sdArch(back));
  // most of the room is in the wall's shadow; only look the lattice up
  // where the opening lets light through
  if (open == 0.0) return 0.0;
  vec2 mid = q.xy + uLightDir.xy * (-0.5 * WALL - q.z) / uLightDir.z;
  return open * smoothstep(-0.003, 0.003, sdLattice(mid));
}

// interleaved gradient noise, to dither the march start per pixel
float ign(vec2 frag) {
  return fract(52.9829189 * fract(dot(frag, vec2(0.06711056, 0.00583715))));
}

const int SCATTER_STEPS = 96;

void main() {
  setupCamera();
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (2.0 * frag - uResolution) / uResolution.y;
  vec3 rd = normalize(uv.x * cu + uv.y * cv + FOCAL * cw);
  vec2 hit = raymarch(rd);

  // Single scattering: march the room's air up to the hit, or up to the
  // screen when the ray leaves through a hole, summing sunlit length.
  float tEnd = rd.z < 0.0 ? min(hit.x, (-0.5 * WALL - ro.z) / rd.z) : hit.x;
  float dt = tEnd / float(SCATTER_STEPS);
  float jitter = ign(frag);
  float scatter = 0.0;
  for (int i = 0; i < SCATTER_STEPS; i++) {
    scatter += sunVisible(ro + rd * (dt * (float(i) + jitter))) * dt;
  }

  // sky through the holes is the brightest thing in the picture
  float surface = 4.0;
  if (hit.y > 0.0) {
    vec3 pos = ro + rd * hit.x;
    vec3 n = calcNormal(pos);
    float sun = clamp(dot(n, uLightDir), 0.0, 1.0);
    // in the room the analytic test is exact and matches the shafts; inside
    // the reveal the wall can shadow itself, so march there
    sun *= pos.z > 0.001 ? sunVisible(pos) : softShadow(pos + n * 0.002, uLightDir);
    float occ = calcAO(pos, n);
    float fill = clamp(dot(n, normalize(vec3(0.2, 0.6, 1.0))), 0.0, 1.0);
    surface = 1.6 * sun + (0.22 * fill + 0.03) * occ;
  }

  // filmic-ish exposure, then a two-tone ramp from ink to paper
  float light = 1.0 - exp(-uExposure * (surface + uDensity * scatter));
  light += (ign(frag + 17.0) - 0.5) / 255.0; // dither the gradient
  outColor = vec4(mix(uInk, uPaper, clamp(light, 0.0, 1.0)), 1.0);
}`;

type RGB = [number, number, number];

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const sketch: Sketch<'webgl2'> = ({ wrap, gl, render, ...props }) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      pane.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, 'aPosition');
  const uniform = (name: string) => gl.getUniformLocation(program, name);

  let paper: RGB = [1, 1, 1];
  let ink: RGB = [0, 0, 0];

  function pickPalette() {
    Random.setSeed(config.seed);
    const palette = randomPalette(7);
    paper = hexToRgb(palette.bg);
    // no riso ink may clear 7:1 on this paper; fall back to black
    ink = hexToRgb(palette.inkColors.length > 0 ? palette.ink() : '#000000');
  }

  pickPalette();

  const pane = new Pane({ title: 'SDF Jali Volumetric' }) as any;
  pane.containerElem_.style.zIndex = 1;
  pane.addBinding(config, 'seed', { min: 1, max: 9999, step: 1 });
  pane.addBinding(config, 'cells', { min: 3, max: 20, step: 1 });
  pane.addBinding(config, 'barWidth', { min: 0.02, max: 0.12, step: 0.005 });
  pane.addBinding(config, 'archRise', { min: 1, max: 2.2, step: 0.05 });
  pane.addBinding(config, 'lightAngle', { min: -0.8, max: 0.8, step: 0.01 });
  pane.addBinding(config, 'lightHeight', { min: 0.2, max: 3, step: 0.01 });
  pane.addBinding(config, 'camAngle', { min: -1, max: 1, step: 0.01 });
  pane.addBinding(config, 'density', { min: 0, max: 2, step: 0.01 });
  pane.addBinding(config, 'exposure', { min: 0.2, max: 4, step: 0.05 });
  pane.on('change', (ev: { last: boolean }) => {
    if (!ev.last) return;
    pickPalette();
    render();
  });

  wrap.render = () => {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const lx = Math.sin(config.lightAngle);
    const lz = -Math.cos(config.lightAngle);
    const ll = Math.hypot(lx, config.lightHeight, lz);

    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    gl.uniform2f(uniform('uResolution'), w, h);
    gl.uniform3f(uniform('uLightDir'), lx / ll, config.lightHeight / ll, lz / ll);
    gl.uniform1f(uniform('uCamAngle'), config.camAngle);
    gl.uniform1f(uniform('uSeed'), config.seed);
    gl.uniform1f(uniform('uCells'), config.cells);
    gl.uniform1f(uniform('uBar'), config.barWidth);
    gl.uniform1f(uniform('uRise'), config.archRise);
    gl.uniform1f(uniform('uDensity'), config.density);
    gl.uniform1f(uniform('uExposure'), config.exposure);
    gl.uniform3f(uniform('uPaper'), ...paper);
    gl.uniform3f(uniform('uInk'), ...ink);
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
};

export const settings: SketchSettings = {
  mode: 'webgl2',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch, settings);

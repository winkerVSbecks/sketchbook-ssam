import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../colors/riso';

/**
 * A jali window hatched with evenly-spaced streamlines — a fork of
 * sdf-hatch/flow-field with jali/truchet.ts rebuilt as an SDF: a wall with a
 * pointed-arch opening, a moulded frame, and a stone screen pierced by the
 * stepped-diagonal truchet tiles. The sun is outside, so the lattice is
 * backlit and throws its pattern onto the room's floor.
 *
 * This fork adds volumetric light: shafts of sun through the lattice, summed
 * along each camera ray and added to the light that sets the hatch spacing,
 * so the beams read as paler air. With `beamFlow` on, the hatching inside a
 * shaft turns to run along the sun's rays.
 *
 * 1. A fragment shader defines `pix(x, y)` — camera → raymarch an SDF scene →
 *    { light, normal } — and, per pixel, turns that into a screen-space hatch
 *    direction: flow_dir = normalize(world2scr2D(cross(normal, hatch_dir))).
 *    It runs once on an offscreen WebGL2 canvas and is read back as a G-buffer.
 * 2. Jobard & Lefer, "Creating Evenly-Spaced Streamlines of Arbitrary Density"
 *    traces streamlines through that field, with the separation distance driven
 *    by the light: min_line_dist = line_width / (1.0001 - light ** gamma).
 *    Ink coverage is line_width / min_line_dist = 1 - light ** gamma, so the
 *    hatching reproduces the shaded tone directly.
 */

interface Config {
  seed: number;
  lineWidth: number;
  gamma: number;
  maxSeparation: number;
  testRatio: number;
  minLength: number;
  seedSpacing: number;
  cells: number;
  barWidth: number;
  archRise: number;
  hatchDir: { x: number; y: number; z: number };
  lightAngle: number;
  lightHeight: number;
  camAngle: number;
  density: number;
  beamFlow: boolean;
  showField: boolean;
}

const config: Config = {
  seed: 7,
  lineWidth: 1.1,
  gamma: 1,
  // separations above this are left blank (highlights)
  maxSeparation: 28,
  // Jobard's d_test / d_sep: how close a growing line may get to another
  testRatio: 0.75,
  minLength: 6,
  // spacing of the fallback seed grid for regions the seed queue never reaches
  seedSpacing: 10,
  // truchet cells across the opening
  cells: 8,
  // bar half width, in cells
  barWidth: 0.07,
  // height of the arch's point above the springing line, in half widths
  archRise: 1.5,
  hatchDir: { x: 0.45, y: 1, z: 0.2 },
  lightAngle: 0.12,
  lightHeight: 0.95,
  camAngle: 0.15,
  // in-scattered light per world unit of sunlit air
  density: 0.2,
  // hatch the shafts along the sun's rays instead of the surface behind them
  beamFlow: true,
  showField: false,
};

const VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec3 uHatchDir;
uniform vec3 uLightDir;
uniform float uCamAngle;
uniform float uSeed;
uniform float uCells;
uniform float uBar;
uniform float uRise;
uniform float uDensity;
uniform float uBeamFlow;

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

// world point → pixel coords (GL convention, y up)
vec2 world2scr2D(vec3 p) {
  vec3 q = p - ro;
  vec2 uv = FOCAL * vec2(dot(q, cu), dot(q, cv)) / dot(q, cw);
  return 0.5 * (uv * uResolution.y + uResolution);
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

struct Pix {
  float light;
  vec3 normal;
  vec3 pos;
  float id;
  float scatter; // sunlit air the ray passed through, before density
  vec3 beam;     // where along the ray that air was, on average
};

const int SCATTER_STEPS = 32;

// pix(x, y): camera → SDF raymarch → [light, normal]
Pix pix(vec2 frag) {
  vec2 uv = (2.0 * frag - uResolution) / uResolution.y;
  vec3 rd = normalize(uv.x * cu + uv.y * cv + FOCAL * cw);
  vec2 hit = raymarch(rd);
  Pix px = Pix(1.0, vec3(0.0), vec3(0.0), hit.y, 0.0, vec3(0.0));

  // Single scattering: march the room's air up to the hit, or up to the
  // screen when the ray leaves through a hole, summing sunlit length.
  float tEnd = rd.z < 0.0 ? min(hit.x, (-0.5 * WALL - ro.z) / rd.z) : hit.x;
  float dt = tEnd / float(SCATTER_STEPS);
  float jitter = ign(frag);
  vec3 beam = vec3(0.0);
  for (int i = 0; i < SCATTER_STEPS; i++) {
    vec3 q = ro + rd * (dt * (float(i) + jitter));
    float lit = sunVisible(q) * dt;
    px.scatter += lit;
    beam += q * lit;
  }
  px.beam = px.scatter > 0.0 ? beam / px.scatter : ro + rd * tEnd;
  if (hit.y == 0.0) return px;

  px.pos = ro + rd * hit.x;
  px.normal = calcNormal(px.pos);
  float sun = clamp(dot(px.normal, uLightDir), 0.0, 1.0);
  // in the room the analytic test is exact and matches the shafts; inside the
  // reveal the wall can shadow itself, so march there
  sun *= px.pos.z > 0.001 ? sunVisible(px.pos) : softShadow(px.pos + px.normal * 0.002, uLightDir);
  float occ = calcAO(px.pos, px.normal);
  // the room side only sees bounce light from in front, dimmer here so the
  // shafts have something to read against
  float fill = clamp(dot(px.normal, normalize(vec3(0.2, 0.6, 1.0))), 0.0, 1.0);
  px.light = clamp(sun + (0.45 * fill + 0.06) * occ + uDensity * px.scatter, 0.0, 1.0);
  return px;
}

void main() {
  setupCamera();
  Pix px = pix(gl_FragCoord.xy);

  // flow_dir = normalize(world2scr2D(cross(normal, hatch_dir)))
  // A direction projects differently at every depth, so it is pushed through
  // the camera as a short world-space segment anchored at the hit point.
  vec2 dir = vec2(0.0);
  vec3 t = cross(px.normal, uHatchDir);
  float tl = length(t);
  if (px.id > 0.0 && tl > 0.02) {
    vec2 d = world2scr2D(px.pos + t / tl * 0.01) - world2scr2D(px.pos);
    if (length(d) > 1e-6) dir = normalize(d);
  }

  // Inside a shaft, turn the hatching toward the sun's rays as they project
  // through the camera at the shaft's depth. Lines have no head or tail, so
  // flip the beam to agree with the surface direction before blending.
  float shaft = uBeamFlow * smoothstep(0.05, 0.35, uDensity * px.scatter);
  if (px.id > 0.0 && shaft > 0.0) {
    vec2 b = world2scr2D(px.beam - uLightDir * 0.01) - world2scr2D(px.beam);
    if (length(b) > 1e-6) {
      b = normalize(b);
      if (dot(b, dir) < 0.0) b = -b;
      vec2 m = mix(dir, b, shaft);
      dir = length(m) > 1e-3 ? normalize(m) : b;
    }
  }
  dir.y = -dir.y; // canvas is y-down

  outColor = vec4(dir, px.light, px.id);
}`;

// Decoded G-buffer, row-major in canvas coordinates (y down).
interface Field {
  w: number;
  h: number;
  fx: Float32Array;
  fy: Float32Array;
  light: Float32Array;
  id: Uint8Array;
}

interface Sample {
  x: number;
  y: number;
  fx: number;
  fy: number;
  light: number;
  id: number;
}

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

function createFieldRenderer(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('webgl2', { antialias: false });
  if (!ctx) throw new Error('WebGL2 unavailable');
  const gl: WebGL2RenderingContext = ctx;

  // The G-buffer goes to a float target: 8-bit flow directions quantise into
  // bands that the streamlines visibly bunch along on large flat walls.
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets unavailable');
  const target = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);

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

  function render(): Field {
    const { x, y, z } = config.hatchDir;
    const hl = Math.hypot(x, y, z) || 1;
    const lx = Math.sin(config.lightAngle);
    const lz = -Math.cos(config.lightAngle);
    const ll = Math.hypot(lx, config.lightHeight, lz);

    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    gl.uniform2f(uniform('uResolution'), w, h);
    gl.uniform3f(uniform('uHatchDir'), x / hl, y / hl, z / hl);
    gl.uniform3f(uniform('uLightDir'), lx / ll, config.lightHeight / ll, lz / ll);
    gl.uniform1f(uniform('uCamAngle'), config.camAngle);
    gl.uniform1f(uniform('uSeed'), config.seed);
    gl.uniform1f(uniform('uCells'), config.cells);
    gl.uniform1f(uniform('uBar'), config.barWidth);
    gl.uniform1f(uniform('uRise'), config.archRise);
    gl.uniform1f(uniform('uDensity'), config.density);
    gl.uniform1f(uniform('uBeamFlow'), config.beamFlow ? 1 : 0);
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const px = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px);

    const field: Field = {
      w,
      h,
      fx: new Float32Array(w * h),
      fy: new Float32Array(w * h),
      light: new Float32Array(w * h),
      id: new Uint8Array(w * h),
    };
    for (let glRow = 0; glRow < h; glRow++) {
      const row = h - 1 - glRow;
      for (let col = 0; col < w; col++) {
        const s = (glRow * w + col) * 4;
        const d = row * w + col;
        field.fx[d] = px[s];
        field.fy[d] = px[s + 1];
        field.light[d] = px[s + 2];
        field.id[d] = Math.round(px[s + 3]);
      }
    }
    return field;
  }

  function dispose() {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  return { render, dispose };
}

// Bilinear flow + light, nearest id. Returns null off-canvas, on the
// background, or where the flow is degenerate (normal ∥ hatch_dir).
function sample(field: Field, x: number, y: number): Sample | null {
  const { w, h } = field;
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return null;
  const id = field.id[Math.round(y) * w + Math.round(x)];
  if (id === 0) return null;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = y0 * w + x0;
  const i10 = y0 * w + x1;
  const i01 = y1 * w + x0;
  const i11 = y1 * w + x1;
  const lerp2 = (a: Float32Array) =>
    (a[i00] * (1 - tx) + a[i10] * tx) * (1 - ty) + (a[i01] * (1 - tx) + a[i11] * tx) * ty;

  const fx = lerp2(field.fx);
  const fy = lerp2(field.fy);
  const len = Math.hypot(fx, fy);
  if (len < 0.5) return null;
  return { x, y, fx: fx / len, fy: fy / len, light: lerp2(field.light), id };
}

// min_line_dist = line_width / (1.0001 - light ** gamma)
function separation(light: number): number {
  return config.lineWidth / (1.0001 - Math.pow(light, config.gamma));
}

/**
 * Jobard & Lefer: grow one streamline at a time in both directions, stopping
 * when it comes within d_test of any existing line; new seeds are proposed
 * d_sep to either side of every finished line, breadth-first, so the whole
 * field fills from the first seed outward. Separation varies per point.
 */
function traceStreamlines(field: Field): number[][][] {
  const cell = 4;
  const cols = Math.ceil(field.w / cell);
  const rows = Math.ceil(field.h / cell);
  const grid: number[][] = Array.from({ length: cols * rows }, () => []);

  // every accepted sample, flat: x, y, line id, arc length along its line
  const px: number[] = [];
  const py: number[] = [];
  const pLine: number[] = [];
  const pArc: number[] = [];
  const alive: boolean[] = [];

  function addPoint(x: number, y: number, line: number, arc: number) {
    const i = px.length;
    px.push(x);
    py.push(y);
    pLine.push(line);
    pArc.push(arc);
    const c = Math.floor(y / cell) * cols + Math.floor(x / cell);
    grid[c].push(i);
  }

  // Is any live sample within r of (x, y)? Samples of `line` closer than
  // `selfArc` along the line from `arc` are the line's own trail and ignored.
  function occupied(x: number, y: number, r: number, line = -1, arc = 0, selfArc = 0): boolean {
    const r2 = r * r;
    const c0 = Math.max(0, Math.floor((x - r) / cell));
    const c1 = Math.min(cols - 1, Math.floor((x + r) / cell));
    const r0 = Math.max(0, Math.floor((y - r) / cell));
    const r1 = Math.min(rows - 1, Math.floor((y + r) / cell));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        for (const i of grid[row * cols + col]) {
          const dx = px[i] - x;
          const dy = py[i] - y;
          if (dx * dx + dy * dy >= r2) continue;
          if (!alive[pLine[i]]) continue;
          if (pLine[i] === line && Math.abs(pArc[i] - arc) < selfArc) continue;
          return true;
        }
      }
    }
    return false;
  }

  function validSeed(x: number, y: number): Sample | null {
    const s = sample(field, x, y);
    if (!s) return null;
    const dsep = separation(s.light);
    if (dsep > config.maxSeparation) return null;
    return occupied(x, y, dsep * 0.99) ? null : s;
  }

  // midpoint (RK2) step along ±flow, staying on the seed's object
  function step(s: Sample, dir: number, h: number, id: number): Sample | null {
    const mid = sample(field, s.x + s.fx * dir * h * 0.5, s.y + s.fy * dir * h * 0.5);
    if (!mid || mid.id !== id) return null;
    const next = sample(field, s.x + mid.fx * dir * h, s.y + mid.fy * dir * h);
    if (!next || next.id !== id) return null;
    return next;
  }

  const lines: number[][][] = [];

  function trace(seed: Sample): number[][] | null {
    const line = alive.length;
    alive.push(true);
    addPoint(seed.x, seed.y, line, 0);

    const halves: number[][][] = [];
    for (const dir of [1, -1]) {
      const pts: number[][] = [];
      let s = seed;
      let arc = 0;
      for (let n = 0; n < 6000; n++) {
        const dsep = separation(s.light);
        const h = Math.min(Math.max(dsep * 0.4, 0.5), 2.5);
        const next = step(s, dir, h, seed.id);
        if (!next) break;
        const nsep = separation(next.light);
        if (nsep > config.maxSeparation) break;
        const dtest = nsep * config.testRatio;
        const nextArc = arc + dir * h;
        if (occupied(next.x, next.y, dtest, line, nextArc, 2 * dtest + 2 * h)) break;
        addPoint(next.x, next.y, line, nextArc);
        pts.push([next.x, next.y]);
        s = next;
        arc = nextArc;
      }
      halves.push(pts);
    }

    const pts = [...halves[1].reverse(), [seed.x, seed.y], ...halves[0]];
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    if (len < config.minLength) {
      alive[line] = false;
      return null;
    }
    return pts;
  }

  // Fallback seeds cover regions the queue never reaches (other objects,
  // islands of shade cut off by highlights).
  const fallback: number[][] = [];
  for (let y = config.seedSpacing / 2; y < field.h; y += config.seedSpacing) {
    for (let x = config.seedSpacing / 2; x < field.w; x += config.seedSpacing) {
      fallback.push([x + Random.range(-0.4, 0.4), y + Random.range(-0.4, 0.4)]);
    }
  }

  for (const [sx, sy] of Random.shuffle(fallback)) {
    const seed = validSeed(sx, sy);
    const first = seed && trace(seed);
    if (!first) continue;
    lines.push(first);

    for (let q = lines.length - 1; q < lines.length; q++) {
      const pts = lines[q];
      for (let i = 0; i < pts.length; i += 2) {
        const s = sample(field, pts[i][0], pts[i][1]);
        if (!s) continue;
        const dsep = separation(s.light);
        for (const side of [1, -1]) {
          const cand = validSeed(pts[i][0] - s.fy * dsep * side, pts[i][1] + s.fx * dsep * side);
          const next = cand && trace(cand);
          if (next) lines.push(next);
        }
      }
    }
  }

  return lines;
}

function drawField(context: CanvasRenderingContext2D, field: Field) {
  const image = context.createImageData(field.w, field.h);
  for (let i = 0; i < field.w * field.h; i++) {
    const on = field.id[i] > 0;
    image.data[i * 4] = on ? (field.fx[i] * 0.5 + 0.5) * 255 : 255;
    image.data[i * 4 + 1] = on ? (field.fy[i] * 0.5 + 0.5) * 255 : 255;
    image.data[i * 4 + 2] = field.light[i] * 255;
    image.data[i * 4 + 3] = 255;
  }
  const tmp = document.createElement('canvas');
  tmp.width = field.w;
  tmp.height = field.h;
  tmp.getContext('2d')?.putImageData(image, 0, 0);
  context.drawImage(tmp, 0, 0);
}

export const sketch = ({ wrap, context, width, height, render, ...props }: SketchProps) => {
  const fieldRenderer = createFieldRenderer(width, height);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      pane.dispose();
      fieldRenderer.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  let field: Field;
  let lines: number[][][] = [];
  let bg = '';
  let ink = '';

  function build() {
    Random.setSeed(config.seed);
    const palette = randomPalette(7);
    bg = palette.bg;
    ink = palette.ink();
    field = fieldRenderer.render();
    lines = traceStreamlines(field);
  }

  build();

  const pane = new Pane({ title: 'SDF Jali Shafts' }) as any;
  pane.containerElem_.style.zIndex = 1;
  pane.addBinding(config, 'seed', { min: 1, max: 9999, step: 1 });
  pane.addBinding(config, 'lineWidth', { min: 0.4, max: 3, step: 0.05 });
  pane.addBinding(config, 'gamma', { min: 0.3, max: 4, step: 0.05 });
  pane.addBinding(config, 'maxSeparation', { min: 4, max: 80, step: 1 });
  pane.addBinding(config, 'testRatio', { min: 0.1, max: 1, step: 0.05 });
  pane.addBinding(config, 'minLength', { min: 0, max: 80, step: 1 });
  pane.addBinding(config, 'seedSpacing', { min: 3, max: 40, step: 1 });
  pane.addBinding(config, 'cells', { min: 3, max: 20, step: 1 });
  pane.addBinding(config, 'barWidth', { min: 0.02, max: 0.12, step: 0.005 });
  pane.addBinding(config, 'archRise', { min: 1, max: 2.2, step: 0.05 });
  pane.addBinding(config, 'hatchDir', {
    x: { min: -1, max: 1 },
    y: { min: -1, max: 1 },
    z: { min: -1, max: 1 },
  });
  pane.addBinding(config, 'lightAngle', { min: -Math.PI, max: Math.PI, step: 0.01 });
  pane.addBinding(config, 'lightHeight', { min: 0.1, max: 3, step: 0.01 });
  pane.addBinding(config, 'camAngle', { min: -Math.PI, max: Math.PI, step: 0.01 });
  pane.addBinding(config, 'density', { min: 0, max: 1, step: 0.01 });
  pane.addBinding(config, 'beamFlow');
  pane.addBinding(config, 'showField');
  pane.on('change', (ev: { last: boolean }) => {
    if (!ev.last) return;
    build();
    render();
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    if (config.showField) {
      drawField(context, field);
      return;
    }

    context.strokeStyle = ink;
    context.lineWidth = config.lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (const pts of lines) {
      context.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) context.lineTo(pts[i][0], pts[i][1]);
    }
    context.stroke();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import { Mesh, Program, Renderer, Triangle, Vec2 } from 'ogl';
import { Pane } from 'tweakpane';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../colors';

// -------------------------------------------------------------------------
// GLSL shaders
// -------------------------------------------------------------------------

const vert = /*glsl*/ `attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}`;

// Maximum number of charges supported by the shader.
// Must match MAX_P below.
const MAX_P = 12;

const frag = /*glsl*/ `precision highp float;

varying vec2 vUv;

uniform vec2  uResolution;
uniform int   uNumParticles;
uniform vec2  uParticlePos[${MAX_P}];   // pixel-space positions
uniform float uParticleCharge[${MAX_P}]; // +1.0 or -1.0
uniform vec3  uParticleColor[${MAX_P}]; // RGB 0-1
uniform vec3  uBgColor;
uniform float uPotentialScale;  // tanh stretch for gradient t
uniform float uBandCount;       // number of flux-line bands
uniform float uBandSharpness;   // pow exponent for band narrowing

void main() {
  // Convert UV → pixel space (Y is flipped: UV(0,0) = bottom-left in OGL)
  vec2 pos = vec2(vUv.x, 1.0 - vUv.y) * uResolution;

  // -----------------------------------------------------------------------
  // Compute electric potential (phi) and stream function (psi) at this pixel.
  //
  // phi = sum( charge_i / r_i )          — constant on equipotentials
  // psi = sum( charge_i * atan2(dy, dx) ) — constant along field lines
  //
  // Together they give an orthogonal "flux-line coordinate system":
  //   psi  → which flux line
  //   phi  → where along that flux line (+ end vs – end)
  // -----------------------------------------------------------------------
  // tanh is GLSL ES 3.0 only; implement manually for ES 1.0 compatibility
  // tanh(x) = (e^2x - 1) / (e^2x + 1), clamped to avoid exp overflow
  // (clamp x to [-10,10] since tanh saturates well before that)
  #define TANH(x) (exp(clamp((x)*2.0,-20.0,20.0)) - 1.0) / (exp(clamp((x)*2.0,-20.0,20.0)) + 1.0)

  float phi = 0.0;
  float psi = 0.0;

  for (int i = 0; i < ${MAX_P}; i++) {
    if (i >= uNumParticles) break;
    vec2  r = pos - uParticlePos[i];
    float d = max(length(r), 1.0);      // clamp to avoid singularity
    phi += uParticleCharge[i] / d;
    psi += uParticleCharge[i] * atan(r.y, r.x);
  }

  // -----------------------------------------------------------------------
  // Gradient value t ∈ [0, 1]:
  //   t ≈ 1  →  near / downstream of a positive charge
  //   t ≈ 0  →  near / downstream of a negative charge
  // tanh gives a smooth sigmoid that saturates near the charges.
  // -----------------------------------------------------------------------
  float t = 0.5 + 0.5 * TANH(phi * uPotentialScale);

  // -----------------------------------------------------------------------
  // Blend colors using inverse-square influence weights — no hard Voronoi
  // boundaries, smooth transitions everywhere.
  // -----------------------------------------------------------------------
  vec3  colorPos  = vec3(0.0);
  vec3  colorNeg  = vec3(0.0);
  float weightPos = 0.0;
  float weightNeg = 0.0;

  for (int i = 0; i < ${MAX_P}; i++) {
    if (i >= uNumParticles) break;
    float d = max(length(pos - uParticlePos[i]), 1.0);
    float w = 1.0 / (d * d);
    if (uParticleCharge[i] > 0.0) {
      colorPos  += uParticleColor[i] * w;
      weightPos += w;
    } else {
      colorNeg  += uParticleColor[i] * w;
      weightNeg += w;
    }
  }

  if (weightPos > 0.0) colorPos /= weightPos;
  if (weightNeg > 0.0) colorNeg /= weightNeg;

  // Gradient color along the flux line
  vec3 gradColor = mix(colorNeg, colorPos, t);

  // -----------------------------------------------------------------------
  // Flux-line banding: sin of the stream function is constant along each
  // field line, so its zero-crossings mark the boundaries between lines.
  //
  // We want thin bright gradient-colored lines on a dark(ened) background:
  //   band ≈ 1  (sin peak)  → full gradient color
  //   band ≈ 0  (sin zero)  → background color (line boundary)
  //
  // pow() sharpens the cosine-bell so lines are thin relative to gaps.
  // -----------------------------------------------------------------------
  float band = abs(sin(psi * uBandCount));       // 0 at boundaries, 1 at centers
  float sharpBand = pow(band, uBandSharpness);   // narrow bright lines, wide dark gaps

  vec3 lineColor = mix(uBgColor * 0.55, gradColor, sharpBand);

  gl_FragColor = vec4(lineColor, 1.0);
}`;

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  phase: number;
  charge: 1 | -1;
  color: [number, number, number]; // RGB 0-1
  dragging: boolean;
  rollover: boolean;
  offsetX: number;
  offsetY: number;
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function cssToRgb01(css: string): [number, number, number] {
  if (css.startsWith('#')) return hexToRgb01(css);
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m)
    return [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255];
  return [1, 1, 1];
}

// Boost saturation of an RGB 0-1 color via HSL
function saturate(
  rgb: [number, number, number],
  amount: number,
): [number, number, number] {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return rgb; // achromatic — can't saturate
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const sNew = Math.min(s * amount, 1);
  // Convert back via HSL → RGB
  const q = l < 0.5 ? l * (1 + sNew) : l + sNew - l * sNew;
  const p = 2 * l - q;
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

// -------------------------------------------------------------------------
// Sketch
// -------------------------------------------------------------------------

const sketch: Sketch<'webgl2'> = ({
  wrap,
  canvas,
  width,
  height,
  pixelRatio,
}) => {
  let pane: Pane;

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      wrap.dispose();
      pane?.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const renderer = new Renderer({ canvas, width, height, dpr: pixelRatio });
  const gl = renderer.gl;

  // -----------------------------------------------------------------------
  // Build initial particles from a random palette
  // -----------------------------------------------------------------------
  const palette = randomPalette();
  const bgCss = palette.pop()!;
  const bgRgb = cssToRgb01(bgCss);
  gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);

  const RAD = 50;

  function makeParticle(sign: 1 | -1, colorCss: string): Particle {
    const x = RAD * 2 + Math.random() * (width - RAD * 4);
    const y = RAD * 2 + Math.random() * (height - RAD * 4);
    return {
      x,
      y,
      baseX: x,
      baseY: y,
      phase: Math.random() * Math.PI * 2,
      charge: sign,
      color: saturate(cssToRgb01(colorCss), 2.0),
      dragging: false,
      rollover: false,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const particles: Particle[] = palette.map((c) =>
    makeParticle(Random.pick([1, -1]) as 1 | -1, c),
  );

  // -----------------------------------------------------------------------
  // Build uniform arrays (flat Float32Array for arrays of structs)
  // -----------------------------------------------------------------------
  function buildUniforms() {
    const pos: number[] = [];
    const charges: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < MAX_P; i++) {
      const p = particles[i];
      if (p) {
        pos.push(p.x, p.y);
        charges.push(p.charge);
        colors.push(...p.color);
      } else {
        pos.push(0, 0);
        charges.push(0);
        colors.push(0, 0, 0);
      }
    }
    return { pos, charges, colors };
  }

  // -----------------------------------------------------------------------
  // WebGL program
  // -----------------------------------------------------------------------
  const geometry = new Triangle(gl);

  const params = {
    potentialScale: 40,
    bandCount: 4.0,
    bandSharpness: 2.5,
    noiseRadius: 1.0,
    noiseAmplitude: 80,
  };

  const { pos, charges, colors } = buildUniforms();

  const program = new Program(gl, {
    vertex: vert,
    fragment: frag,
    uniforms: {
      uResolution: { value: new Vec2(width, height) },
      uNumParticles: { value: particles.length },
      uParticlePos: { value: pos },
      uParticleCharge: { value: charges },
      uParticleColor: { value: colors },
      uBgColor: { value: bgRgb },
      uPotentialScale: { value: params.potentialScale },
      uBandCount: { value: params.bandCount },
      uBandSharpness: { value: params.bandSharpness },
    },
  });

  const mesh = new Mesh(gl, { geometry, program });

  function pushUniforms() {
    const u = buildUniforms();
    program.uniforms.uNumParticles.value = particles.length;
    program.uniforms.uParticlePos.value = u.pos;
    program.uniforms.uParticleCharge.value = u.charges;
    program.uniforms.uParticleColor.value = u.colors;
  }

  // -----------------------------------------------------------------------
  // Tweakpane
  // -----------------------------------------------------------------------
  function addParticle(sign: 1 | -1) {
    if (particles.length >= MAX_P) return;
    const colorCss = palette[particles.length % palette.length];
    particles.push(makeParticle(sign, colorCss));
    pushUniforms();
  }

  function removeParticle() {
    if (particles.length > 1) particles.pop();
    pushUniforms();
  }

  let paused = false;

  pane = new Pane({ title: 'Electric Field (Shader)' });
  pane.addButton({ title: 'Pause / Resume' }).on('click', () => {
    paused = !paused;
  });
  pane.addButton({ title: 'Add (+)' }).on('click', () => addParticle(1));
  pane.addButton({ title: 'Add (-)' }).on('click', () => addParticle(-1));
  pane.addButton({ title: 'Remove' }).on('click', removeParticle);
  pane
    .addBinding(params, 'potentialScale', {
      label: 'Potential Scale',
      min: 1,
      max: 300,
      step: 1,
    })
    .on('change', () => {
      program.uniforms.uPotentialScale.value = params.potentialScale;
    });
  pane
    .addBinding(params, 'bandCount', {
      label: 'Band Count',
      min: 0.5,
      max: 16.0,
      step: 0.25,
    })
    .on('change', () => {
      program.uniforms.uBandCount.value = params.bandCount;
    });
  pane
    .addBinding(params, 'bandSharpness', {
      label: 'Band Sharpness',
      min: 0.1,
      max: 10.0,
      step: 0.1,
    })
    .on('change', () => {
      program.uniforms.uBandSharpness.value = params.bandSharpness;
    });
  pane.addBinding(params, 'noiseAmplitude', {
    label: 'Noise Amplitude',
    min: 0,
    max: 300,
    step: 5,
  });

  // -----------------------------------------------------------------------
  // Mouse interaction — drag charges
  // -----------------------------------------------------------------------
  const HIT_RADIUS = 30;

  function getCanvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const { x: mx, y: my } = getCanvasPos(e);
    let anyCursor = false;
    for (const p of particles) {
      p.rollover =
        Math.abs(mx - p.x) < HIT_RADIUS && Math.abs(my - p.y) < HIT_RADIUS;
      if (p.dragging) {
        p.x = mx + p.offsetX;
        p.y = my + p.offsetY;
        pushUniforms();
        canvas.style.cursor = 'grabbing';
        anyCursor = true;
      } else if (p.rollover) {
        canvas.style.cursor = 'grab';
        anyCursor = true;
      }
    }
    if (!anyCursor) canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const { x: mx, y: my } = getCanvasPos(e);
    for (const p of particles) {
      if (Math.abs(mx - p.x) < HIT_RADIUS && Math.abs(my - p.y) < HIT_RADIUS) {
        p.dragging = true;
        p.offsetX = p.x - mx;
        p.offsetY = p.y - my;
      }
    }
  });

  canvas.addEventListener('mouseup', () => {
    for (const p of particles) {
      if (p.dragging) {
        p.baseX = p.x;
        p.baseY = p.y;
      }
      p.dragging = false;
    }
  });

  // -----------------------------------------------------------------------
  // Render loop
  // -----------------------------------------------------------------------
  wrap.render = ({ playhead }) => {
    for (const p of particles) {
      if (!p.dragging && !paused) {
        const angle = playhead * Math.PI * 2 + p.phase;
        const nx = Math.cos(angle) * params.noiseRadius;
        const ny = Math.sin(angle) * params.noiseRadius;
        p.x =
          p.baseX + Random.noise2D(nx + p.phase, ny) * params.noiseAmplitude;
        p.y =
          p.baseY +
          Random.noise2D(nx, ny + p.phase + 10) * params.noiseAmplitude;
      }
    }
    pushUniforms();
    renderer.render({ scene: mesh });
  };

  wrap.resize = ({ width, height }) => {
    program.uniforms.uResolution.value.set(width, height);
    renderer.setSize(width, height);
  };

  wrap.unload = () => {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
};

export const settings: SketchSettings = {
  mode: 'webgl2',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 12_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
  attributes: { preserveDrawingBuffer: true },
};

ssam(sketch, settings);

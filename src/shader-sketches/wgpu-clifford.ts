import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';

// ---------------------------------------------------------------------------
// Lesson 05 — The Clifford Torus  (WebGPU port of https://www.shadertoy.com/view/wsfGDS)
// Same raymarch engine as Lesson 04; only `map` is stranger: a torus living on a
// 3-sphere in 4D, inverse-stereographically projected into 3D, rotated in 4D so
// it turns inside-out. Every function here was ported across Lessons 02–05.
// Run it:  VITE_SKETCH="shader-sketches/wgpu-clifford" npm run dev
// ---------------------------------------------------------------------------

const shader = /* wgsl */ `
const PI = 3.14159265359;

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0)       uv  : vec2f,
};

struct Uniforms {
  resolution: vec2f,
  time: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VSOut {
  var corners = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  var out : VSOut;
  let p   = corners[vid];
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv  = p * 0.5 + 0.5;
  return out;
}

// ---- palette (Lesson 02) -------------------------------------------------
fn pal(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(6.28318 * (c * t + d));
}
fn spectrum(n: f32) -> vec3f {
  return pal(n, vec3f(0.5, 0.5, 0.5), vec3f(0.5, 0.5, 0.5),
                vec3f(1.0, 1.0, 1.0), vec3f(0.0, 0.33, 0.67));
}

// ---- HG_SDF helpers (Lessons 02 & 05) ------------------------------------
fn pR(p: ptr<function, vec2f>, a: f32) {
  *p = cos(a) * (*p) + sin(a) * vec2f((*p).y, -(*p).x);
}
fn glslMod2(p: vec2f, s: vec2f) -> vec2f {
  return p - s * floor(p / s);            // GLSL-floored mod (negative-safe)
}
fn pMod2(p: ptr<function, vec2f>, size: vec2f) -> vec2f {
  let c = floor((*p + size * 0.5) / size);
  *p = glslMod2(*p + size * 0.5, size) - size * 0.5;
  return c;
}
fn smax(a: f32, b: f32, r: f32) -> f32 {
  let uu = max(vec2f(r + a, r + b), vec2f(0.0));
  return min(-r, max(a, b)) + length(uu);
}

// ---- Clifford torus SDF (Lesson 05) --------------------------------------
struct Stereo { p4: vec4f, k: f32 };
fn inverseStereographic(p: vec3f) -> Stereo {
  let k = 2.0 / (1.0 + dot(p, p));
  return Stereo(vec4f(k * p, k - 1.0), k);
}

struct TorusHit { d: f32, uv: vec2f };
fn fTorus(p4: vec4f) -> TorusHit {
  let d1 = length(p4.xy) / length(p4.zw) - 1.0;
  let d2 = length(p4.zw) / length(p4.xy) - 1.0;
  var d  = select(d2, -d1, d1 < 0.0);     // d1 < 0. ? -d1 : d2
  d = d / PI;
  let uv = (vec2f(atan2(p4.y, p4.x), atan2(p4.z, p4.w)) / PI) * 0.5 + 0.5;
  return TorusHit(d, uv);
}

fn fixDistance(d0: f32, k: f32) -> f32 {
  let sn = sign(d0);
  var d  = abs(d0);
  d = d / k * 1.82;
  d = d + 1.0;
  d = pow(d, 0.5);
  d = d - 1.0;
  d = d * (5.0 / 3.0);
  return d * sn;
}

fn map(p0: vec3f) -> f32 {
  let s  = inverseStereographic(p0);
  var p4 = s.p4;
  let k  = s.k;

  // rotate two planes of p4 in 4D (extract -> rotate -> rebuild: no &swizzle)
  var zy = vec2f(p4.z, p4.y);
  pR(&zy, u.time * -PI / 2.0);
  p4 = vec4f(p4.x, zy.y, zy.x, p4.w);

  var xw = vec2f(p4.x, p4.w);
  pR(&xw, u.time * -PI / 2.0);
  p4 = vec4f(xw.x, p4.y, p4.z, xw.y);

  let hit  = fTorus(p4);
  let zval = hit.d;                        // torus distance becomes the "depth"

  // wrap a repeating domain across the surface, then a circle per cell
  let uvScale = 2.25;
  let repeat  = uvScale / 10.0;
  var xy = hit.uv * uvScale + repeat * 0.5;
  _ = pMod2(&xy, vec2f(repeat));

  var d = length(xy) - repeat * 0.4;
  d = smax(d, abs(zval) - 0.013, 0.01);    // give the circles thickness
  d = fixDistance(d, k);
  return d;
}

fn calcNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.0001, 0.0);
  return normalize(vec3f(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

fn calcLookAt(ro: vec3f, ta: vec3f, up: vec3f) -> mat3x3f {
  let ww = normalize(ta - ro);
  let uu = normalize(cross(ww, up));
  let vv = normalize(cross(uu, ww));
  return mat3x3f(uu, vv, ww);              // column-major, like GLSL mat3(uu,vv,ww)
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  // Shadertoy-style centered, aspect-correct coords
  let pp = in.uv * 2.0 - 1.0;
  let p  = vec2f(pp.x * u.resolution.x / u.resolution.y, pp.y);

  let camPos = vec3f(1.8, 5.5, -5.5);
  let camTar = vec3f(0.1, 0.0, 0.1);
  let camUp  = vec3f(-1.0, 0.0, -1.5);
  let camMat = calcLookAt(camPos, camTar, camUp);

  let ro = camPos;
  let rd = normalize(camMat * vec3f(p, 2.4));   // focalLength 2.4

  let MAX_DIST = 12.0;
  var rayLength = 0.0;
  var dist = 0.0;
  var pos = ro;
  var hit = false;
  // heavy shader: 300 steps at DPR 1. Raise for cleaner inner edges; lower if it stutters.
  for (var i = 0; i < 300; i = i + 1) {
    rayLength = rayLength + dist;
    pos = ro + rd * rayLength;
    dist = map(pos);
    if (dist < 0.001) { hit = true; break; }
    if (rayLength > MAX_DIST) { break; }
  }

  var color = vec3f(0.0);
  if (hit) {
    let n = calcNormal(pos);
    color = vec3f(dot(normalize(vec3f(1.0, 0.5, 0.0)), n) * 0.5 + 0.5);
  }

  let fog = pow(smoothstep(7.25, MAX_DIST, rayLength), 0.25);
  color = mix(color, vec3f(0.0), fog);
  color = spectrum((color.r * 2.0 - 1.0) * 0.2 + 0.4);
  color = color * mix(1.0, 0.025, fog);
  color = pow(color, vec3f(1.0 / 2.2));            // gamma
  return vec4f(color, 1.0);
}
`;

const sketch: Sketch<'webgpu'> = async ({ wrap, context }) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU not available in this browser.');
  const device = await adapter.requestDevice();

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const uniformBuffer = device.createBuffer({
    size: 16, // vec2f(8) + f32(4) = 12 bytes, rounded up to a 16-byte row
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const uniforms = new Float32Array(4);

  wrap.render = ({ canvas, playhead }) => {
    uniforms[0] = canvas.width;
    uniforms[1] = canvas.height;
    uniforms[2] = playhead; // 0..1 loop = the torus's `time = mod(iTime/2., 1.)`
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  wrap.unload = () => device.destroy();
};

const settings: SketchSettings = {
  mode: 'webgpu',
  dimensions: [1080, 1080],
  pixelRatio: 2, // heavy raymarcher — keep the pixel count modest
  animate: true,
  duration: 6_000,
  playFps: 60,
};

ssam(sketch, settings);

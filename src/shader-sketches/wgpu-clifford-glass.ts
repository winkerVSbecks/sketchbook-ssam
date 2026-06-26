import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import { Pane } from 'tweakpane';

// ---------------------------------------------------------------------------
// Fork of wgpu-clifford-frosted — physically-fuller glass:
//   • TWO-BEND refraction: refract in -> march the interior -> refract out
//     (with total-internal-reflection handling + Beer-Lambert absorption).
//   • MULTI-SAMPLE frost: average N independent jittered samples for a creamy
//     blur instead of sparkle.
// VERY heavy (N x two-bend marches per pixel at 1080^2 x DPR 2). Built for an
// export frame. For a live preview: samples = 1 and/or pixelRatio = 1.
// Run it:  VITE_SKETCH="shader-sketches/wgpu-clifford-glass" npm run dev
// ---------------------------------------------------------------------------

const shader = /* wgsl */ `
const PI = 3.14159265359;
const MAX_DIST = 12.0;

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0)       uv  : vec2f,
};

// 48 bytes, now FULLY packed: the two former pad slots became ior and samples.
struct Uniforms {
  resolution: vec2f,   // [0],[1]
  time:       f32,     // [2]
  frost:      f32,     // [3]  normal-jitter amount (scatter)
  specExp:    f32,     // [4]  highlight sharpness
  fresnelPow: f32,     // [5]  rim falloff
  iridAmt:    f32,     // [6]  iridescent tint at the rim
  ior:        f32,     // [7]  index of refraction
  bodyColor:  vec3f,   // [8],[9],[10]  (transmission colour for Beer-Lambert)
  samples:    f32,     // [11]  frost samples to average
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

// ---- palette + hash ------------------------------------------------------
fn pal(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(6.28318 * (c * t + d));
}
fn spectrum(n: f32) -> vec3f {
  return pal(n, vec3f(0.5, 0.5, 0.5), vec3f(0.5, 0.5, 0.5),
                vec3f(1.0, 1.0, 1.0), vec3f(0.0, 0.33, 0.67));
}
fn hash33(p: vec3f) -> vec3f {
  let q = vec3f(dot(p, vec3f(127.1, 311.7, 74.7)),
                dot(p, vec3f(269.5, 183.3, 246.1)),
                dot(p, vec3f(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453);
}

// ---- HG_SDF helpers ------------------------------------------------------
fn pR(p: ptr<function, vec2f>, a: f32) {
  *p = cos(a) * (*p) + sin(a) * vec2f((*p).y, -(*p).x);
}
fn glslMod2(p: vec2f, s: vec2f) -> vec2f {
  return p - s * floor(p / s);
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

// ---- Clifford torus SDF (unchanged from Lesson 05) -----------------------
struct Stereo { p4: vec4f, k: f32 };
fn inverseStereographic(p: vec3f) -> Stereo {
  let k = 2.0 / (1.0 + dot(p, p));
  return Stereo(vec4f(k * p, k - 1.0), k);
}

struct TorusHit { d: f32, uv: vec2f };
fn fTorus(p4: vec4f) -> TorusHit {
  let d1 = length(p4.xy) / length(p4.zw) - 1.0;
  let d2 = length(p4.zw) / length(p4.xy) - 1.0;
  var d  = select(d2, -d1, d1 < 0.0);
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

  var zy = vec2f(p4.z, p4.y);
  pR(&zy, u.time * -PI / 2.0);
  p4 = vec4f(p4.x, zy.y, zy.x, p4.w);

  var xw = vec2f(p4.x, p4.w);
  pR(&xw, u.time * -PI / 2.0);
  p4 = vec4f(xw.x, p4.y, p4.z, xw.y);

  let hit  = fTorus(p4);
  let zval = hit.d;

  let uvScale = 2.25;
  let repeat  = uvScale / 10.0;
  var xy = hit.uv * uvScale + repeat * 0.5;
  _ = pMod2(&xy, vec2f(repeat));

  var d = length(xy) - repeat * 0.4;
  d = smax(d, abs(zval) - 0.013, 0.01);
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
  return mat3x3f(uu, vv, ww);
}

// ---- ray marching --------------------------------------------------------
struct March { hit: bool, pos: vec3f, rl: f32 };

fn march(ro: vec3f, rd: vec3f, maxSteps: i32) -> March {
  var rl = 0.0;
  var d = 0.0;
  var pos = ro;
  var hit = false;
  for (var i = 0; i < maxSteps; i = i + 1) {
    rl = rl + d;
    pos = ro + rd * rl;
    d = map(pos);
    if (d < 0.001) { hit = true; break; }
    if (rl > MAX_DIST) { break; }
  }
  return March(hit, pos, rl);
}

// March INSIDE the glass (map < 0) until we reach the back face.
struct Inside { pos: vec3f, len: f32, exited: bool };
fn marchInside(ro: vec3f, rd: vec3f, maxSteps: i32) -> Inside {
  var t = 0.006;
  var pos = ro;
  var exited = false;
  for (var i = 0; i < maxSteps; i = i + 1) {
    pos = ro + rd * t;
    let d = map(pos);
    if (d > 0.001) { exited = true; break; }   // crossed back out into air
    t = t + max(-d, 0.004);                     // step by interior distance (>=0)
  }
  return Inside(pos, t, exited);
}

fn environment(dir: vec3f) -> vec3f {
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  return mix(vec3f(0.02, 0.03, 0.05), vec3f(0.10, 0.12, 0.17), t);
}
fn shadeOpaque(pos: vec3f, rd: vec3f) -> vec3f {
  let n = calcNormal(pos);
  let light = normalize(vec3f(1.0, 0.5, 0.0));
  let diff = dot(n, light) * 0.5 + 0.5;
  return spectrum(diff * 0.25 + 0.4) * (0.35 + 0.65 * diff);
}
fn shadeRay(m: March, dir: vec3f) -> vec3f {
  if (m.hit) { return shadeOpaque(m.pos, dir); }
  return environment(dir);
}

// One frosted sample: reflection + full two-bend refraction, jittered by seed.
fn glassSample(pHit: vec3f, baseN: vec3f, rd: vec3f, seed: f32) -> vec3f {
  let viewDir = -rd;

  // frosted entry normal
  var n = normalize(baseN + (hash33(pHit * 22.0 + seed) - 0.5) * u.frost);
  if (dot(n, viewDir) < 0.0) { n = -n; }

  let fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), u.fresnelPow);

  // reflection off the front face
  let reflDir = reflect(rd, n);
  let reflCol = shadeRay(march(pHit + n * 0.02, reflDir, 64), reflDir);

  // refraction: bend in, cross the interior, bend out (two bends)
  let inDir = refract(rd, n, 1.0 / u.ior);
  var refrCol: vec3f;
  let ins = marchInside(pHit, inDir, 28);
  if (ins.exited) {
    // frosted exit normal, flipped to face the interior ray
    var nBack = normalize(calcNormal(ins.pos) + (hash33(ins.pos * 22.0 + seed + 5.0) - 0.5) * u.frost);
    if (dot(nBack, inDir) > 0.0) { nBack = -nBack; }

    let outDir = refract(inDir, nBack, u.ior);     // glass -> air
    if (dot(outDir, outDir) < 0.25) {
      // total internal reflection: bounce back inside instead of exiting
      let tir = reflect(inDir, nBack);
      refrCol = shadeRay(march(ins.pos + tir * 0.02, tir, 64), tir);
    } else {
      refrCol = shadeRay(march(ins.pos + outDir * 0.02, outDir, 128), outDir);
    }
    // Beer-Lambert: the further through glass, the more it's tinted by the body
    let absorb = (vec3f(1.0) - u.bodyColor) * 28.0;
    refrCol = refrCol * exp(-absorb * ins.len);
  } else {
    // never found a back face (grazing/very thin): pass through, lightly tinted
    refrCol = shadeRay(march(pHit + inDir * 0.05, inDir, 128), inDir);
    refrCol = refrCol * mix(vec3f(1.0), u.bodyColor, 0.5);
  }

  // Fresnel blend + sheen + iridescent rim
  var col = mix(refrCol, reflCol, fres);
  let hvec = normalize(normalize(vec3f(1.0, 0.5, 0.0)) + viewDir);
  col += pow(max(dot(n, hvec), 0.0), u.specExp) * 0.4;
  col += fres * spectrum(fres * 0.7 + u.time * 0.2) * u.iridAmt * 0.5;
  return col;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  let pp = in.uv * 2.0 - 1.0;
  let p  = vec2f(pp.x * u.resolution.x / u.resolution.y, pp.y);

  let camPos = vec3f(1.8, 5.5, -5.5);
  let camMat = calcLookAt(camPos, vec3f(0.1, 0.0, 0.1), vec3f(-1.0, 0.0, -1.5));
  let ro = camPos;
  let rd = normalize(camMat * vec3f(p, 2.4));

  let prim = march(ro, rd, 300);

  var color = environment(rd);
  if (prim.hit) {
    let baseN = calcNormal(prim.pos);
    let nSamp = i32(max(u.samples, 1.0));
    var acc = vec3f(0.0);
    for (var i = 0; i < nSamp; i = i + 1) {
      acc = acc + glassSample(prim.pos, baseN, rd, f32(i) * 17.31 + 0.5);
    }
    color = acc / f32(nSamp);
  }

  let fogAmt = pow(smoothstep(7.25, MAX_DIST, prim.rl), 0.25);
  let fog = select(0.0, fogAmt, prim.hit);
  color = mix(color, vec3f(0.02, 0.03, 0.05), fog);
  color = pow(color, vec3f(1.0 / 2.2));
  return vec4f(color, 1.0);
}
`;

// Live controls. Each maps to one slot in the Uniforms struct above.
const params = {
  frost: 0.06,
  sheen: 8.0,
  rim: 5.0,
  iridescence: 0.5,
  ior: 1.45,
  samples: 4,
  body: { r: 0.86, g: 0.91, b: 0.98 },
};

const sketch: Sketch<'webgpu'> = async ({ wrap, context }) => {
  const pane = new Pane({ title: 'glass' });
  pane.addBinding(params, 'frost', { min: 0, max: 0.3, step: 0.005 });
  pane.addBinding(params, 'sheen', {
    min: 1,
    max: 64,
    step: 1,
    label: 'sheen',
  });
  pane.addBinding(params, 'rim', {
    min: 1,
    max: 8,
    step: 0.1,
    label: 'rim glow',
  });
  pane.addBinding(params, 'iridescence', { min: 0, max: 1, step: 0.01 });
  pane.addBinding(params, 'ior', {
    min: 1.0,
    max: 2.0,
    step: 0.01,
    label: 'refraction (ior)',
  });
  pane.addBinding(params, 'samples', {
    min: 1,
    max: 12,
    step: 1,
    label: 'frost samples',
  });
  pane.addBinding(params, 'body', {
    color: { type: 'float' },
    label: 'glass tint',
  });

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
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const uniforms = new Float32Array(12);

  wrap.render = ({ canvas, playhead }) => {
    uniforms[0] = canvas.width;
    uniforms[1] = canvas.height;
    uniforms[2] = playhead;
    uniforms[3] = params.frost;
    uniforms[4] = params.sheen;
    uniforms[5] = params.rim;
    uniforms[6] = params.iridescence;
    uniforms[7] = params.ior;
    uniforms[8] = params.body.r;
    uniforms[9] = params.body.g;
    uniforms[10] = params.body.b;
    uniforms[11] = params.samples;
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

  wrap.unload = () => {
    pane.dispose();
    device.destroy();
  };
};

const settings: SketchSettings = {
  mode: 'webgpu',
  dimensions: [600, 600],
  pixelRatio: 2,
  animate: true,
  duration: 6_000,
  playFps: 60,
};

ssam(sketch, settings);

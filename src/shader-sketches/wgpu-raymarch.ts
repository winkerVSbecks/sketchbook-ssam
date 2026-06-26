import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';

// ---------------------------------------------------------------------------
// Lesson 04 — Raymarching an SDF
// Each pixel shoots a ray into a 3D scene and "sphere-traces" it until it hits
// a surface, then shades the hit. Same WGSL you already know — new technique.
// Reuses your pal / spectrum / pR from Lessons 02–03.
// Run it:  VITE_SKETCH="shader-sketches/wgpu-raymarch" npm run dev
// ---------------------------------------------------------------------------

const shader = /* wgsl */ `
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

// ---- your ported pieces (Lessons 02–03) ----------------------------------
fn pal(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(6.28318 * (c * t + d));
}
fn spectrum(n: f32) -> vec3f {
  return pal(n, vec3f(0.5, 0.5, 0.5), vec3f(0.5, 0.5, 0.5),
                vec3f(1.0, 1.0, 1.0), vec3f(0.0, 0.33, 0.67));
}
fn pR(p: ptr<function, vec2f>, a: f32) {
  *p = cos(a) * (*p) + sin(a) * vec2f((*p).y, -(*p).x);
}

// ---- the scene: a signed distance function -------------------------------

fn fTorus(p: vec3f, smallRadius: f32, largeRadius: f32) -> f32 {
    return length(vec2(length(p.xz) - largeRadius, p.y)) - smallRadius;
}

// map(p) returns the distance from p to the nearest surface (negative inside).
fn map(p0: vec3f) -> f32 {
  var p = p0;

  // Tumble the whole space over time. Invisible on a sphere (it's symmetric),
  // but the moment you swap in a torus, this tilts and spins it.
  var yz = vec2f(p.y, p.z);
  pR(&yz, u.time * 6.28318);
  p = vec3f(p.x, yz.x, yz.y);

  return fTorus(p, 0.4, 1.0);
}

// surface normal = gradient of the SDF, by central differences
fn calcNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.0005, 0.0);
  return normalize(vec3f(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  // centered, aspect-correct screen coords in roughly -1..1
  let pix    = in.uv * 2.0 - 1.0;
  let aspect = u.resolution.x / u.resolution.y;
  let sp     = vec2f(pix.x * aspect, pix.y);

  // camera: eye on +z, looking toward -z; sp aims the ray through this pixel
  let ro = vec3f(0.0, 0.0, 3.0);
  let rd = normalize(vec3f(sp, -1.6));

  // the march: step forward by the SDF distance (the largest provably-safe step)
  var t   = 0.0;
  var hit = false;
  for (var i = 0; i < 96; i = i + 1) {
    let pos = ro + rd * t;
    let d   = map(pos);
    if (d < 0.001) { hit = true; break; }   // close enough -> we hit a surface
    t = t + d;
    if (t > 20.0) { break; }                // ran off into empty space
  }

  var col = vec3f(0.02, 0.02, 0.03);         // background
  if (hit) {
    let pos   = ro + rd * t;
    let n     = calcNormal(pos);
    let light = normalize(vec3f(0.7, 0.8, 0.2));
    let diff  = dot(n, light) * 0.5 + 0.5;   // Lambert, remapped to 0..1
    col = spectrum(diff);                    // tint by light using your palette
  }

  col = pow(col, vec3f(1.0 / 2.2));          // gamma
  return vec4f(col, 1.0);
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
    uniforms[2] = playhead;
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
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
};

ssam(sketch, settings);

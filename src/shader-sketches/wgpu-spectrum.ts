import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';

// ---------------------------------------------------------------------------
// Lessons 02–03 — Speaking WGSL + Uniforms & time
// Your ported pal / spectrum / pR draw the image; a `time` uniform spins it.
// Type aliases (vec2f, vec3f, vec4f) used throughout.
// Run it:  VITE_SKETCH="shader-sketches/wgpu-spectrum" npm run dev
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

// ---- ported from the Clifford Torus shader (Lesson 02) -------------------

// Inigo Quílez cosine palette.
fn pal(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(6.28318 * (c * t + d));
}
fn spectrum(n: f32) -> vec3f {
  return pal(n, vec3f(0.5, 0.5, 0.5), vec3f(0.5, 0.5, 0.5),
                vec3f(1.0, 1.0, 1.0), vec3f(0.0, 0.33, 0.67));
}

// pR: rotate a 2D point in place. The inout -> pointer port (corrected type).
fn pR(p: ptr<function, vec2f>, a: f32) {
  *p = cos(a) * (*p) + sin(a) * vec2f((*p).y, -(*p).x);
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  var p = in.uv - 0.5;          // center the coords around 0
  pR(&p, 6.28318 * u.time);     // rotate by time: one full turn per playhead loop
  return vec4f(spectrum(p.x + 0.5), 1.0);
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
    layout: pipeline.getBindGroupLayout(0), // matches @group(0)
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const uniforms = new Float32Array(4); // 4 floats = 16 bytes

  wrap.render = ({ canvas, playhead }) => {
    uniforms[0] = canvas.width; // resolution.x
    uniforms[1] = canvas.height; // resolution.y
    uniforms[2] = playhead; // 0..1 loop — this is our iTime
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

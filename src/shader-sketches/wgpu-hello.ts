import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';

// ---------------------------------------------------------------------------
// Lesson 01 — Hello, WGSL
// The smallest possible WebGPU sketch: a full-screen triangle drawn by a
// vertex shader, coloured by a fragment shader. No buffers, no textures.
// Run it:  VITE_SKETCH="shader-sketches/wgpu-hello" npm run dev
// ---------------------------------------------------------------------------

// WGSL — WebGPU's shader language. Two entry points live in one module:
//   vs  : runs once per vertex, returns clip-space position (+ varyings)
//   fs  : runs once per pixel, returns the final colour
const shader = /* wgsl */ `
struct VSOut {
  @builtin(position) pos : vec4<f32>,   // required: clip-space position
  @location(0)       uv  : vec2<f32>,   // a "varying" handed to the fragment stage
};

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VSOut {
  // One oversized triangle that covers the whole screen. The bits outside
  // the -1..1 clip box are simply discarded, so 3 vertices fill the canvas
  // with no vertex buffer needed.
  //
  //   (-1, 3)
  //      |\
  //      |  \
  //      |____\ (1, 1)   <- the visible square is the lower-left of the tri
  //      |____|_\
  //   (-1,-1)   (3,-1)
  var corners = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );

  var out : VSOut;
  let p = corners[vid];
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv  = p * 0.5 + 0.5;             // clip-space (-1..1) -> uv (0..1) on screen
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // uv.x -> red (left to right), uv.y -> green (bottom to top)
  return vec4<f32>(in.uv, 0.5, 1.0);
}
`;

const sketch: Sketch<'webgpu'> = async ({ wrap, context }) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // 1. Get a logical GPU. ssam already created the canvas + context for us.
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU not available in this browser.');
  const device = await adapter.requestDevice();

  // 2. Tell the canvas's context which device + pixel format to use.
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  // 3. Compile the WGSL and bake it into a render pipeline.
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  // 4. Each frame: record one render pass that clears, then draws 3 vertices.
  wrap.render = () => {
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
    pass.draw(3); // three vertices -> one full-screen triangle
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

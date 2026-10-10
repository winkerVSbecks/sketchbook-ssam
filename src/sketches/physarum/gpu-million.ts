/// <reference types="@webgpu/types" />
import { ssam } from 'ssam';
import type { Sketch, SketchSettings, WebGPUProps } from 'ssam';
import Random from 'canvas-sketch-util/random';
import pack from 'pack-spheres';
import { converter } from 'culori';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';

// physarum/trail's sense–steer–deposit loop as WebGPU compute: a million
// agents seeded on the rims of the same pack-spheres circles. Each step is
// three passes — agents (sense three points, turn, move, atomically deposit),
// field (3×3 diffuse, decay, fold the deposits in) and a copy back — and the
// trail is drawn through the palette as a three-stop ramp.

Random.setSeed(Random.getRandomSeed());
console.log(`Seed: ${Random.getSeed()}`);

const config = {
  count: 1 << 20,
  sensorAngle: Math.PI / 4,
  rotationAngle: Math.PI / 4,
  sensorDist: 11,
  speed: 1,
  deposit: 1,
  decay: 0.9,
  diffuse: 0.5,
  // simulation steps per rendered frame
  steps: 2,
  // steps run at reset so the first frame already shows a network
  warmup: 40,
  // trail density → colour: 1 − exp(−v · gain)
  gain: 0.025,
};

const toRgb = converter('rgb');
const colors = [...Random.pick([...mindfulPalettes, ...autoAlbersPalettes])];
const bg = colors.pop()!;
const [inkA, inkB = inkA] = Random.shuffle(colors);
const rgb = (c: string) => {
  const v = toRgb(c);
  return [v?.r ?? 0, v?.g ?? 0, v?.b ?? 0, 1];
};

const WG = 256;

const common = /* wgsl */ `
struct U {
  size: vec2u,
  count: u32,
  frame: u32,
  sensorAngle: f32,
  rotationAngle: f32,
  sensorDist: f32,
  speed: f32,
  deposit: f32,
  decay: f32,
  diffuse: f32,
  gain: f32,
  bg: vec4f,
  inkA: vec4f,
  inkB: vec4f,
};
@group(0) @binding(0) var<uniform> u: U;

fn wrapIdx(p: vec2i) -> u32 {
  let s = vec2i(u.size);
  let q = ((p % s) + s) % s;
  return u32(q.y) * u.size.x + u32(q.x);
}

fn hash(n: u32) -> f32 {
  var x = n;
  x ^= x >> 16u; x *= 0x7feb352du;
  x ^= x >> 15u; x *= 0x846ca68bu;
  x ^= x >> 16u;
  return f32(x) / 4294967295.0;
}
`;

const agentWgsl = /* wgsl */ `
${common}
@group(0) @binding(1) var<storage, read_write> agents: array<vec4f>;
@group(0) @binding(2) var<storage, read> trail: array<f32>;
@group(0) @binding(3) var<storage, read_write> deposits: array<atomic<u32>>;

fn sense(p: vec2f, a: f32) -> f32 {
  let s = p + vec2f(cos(a), sin(a)) * u.sensorDist;
  return trail[wrapIdx(vec2i(floor(s)))];
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u.count) { return; }
  var a = agents[i];
  var h = a.z;
  let f = sense(a.xy, h);
  let l = sense(a.xy, h - u.sensorAngle);
  let r = sense(a.xy, h + u.sensorAngle);

  // trail.ts's steering, verbatim
  if (f > l && f > r) {
  } else if (f < l && f < r) {
    h += select(-u.rotationAngle, u.rotationAngle, hash(i * 1664525u + u.frame * 22695477u) > 0.5);
  } else if (l > r) {
    h -= u.rotationAngle;
  } else if (r > l) {
    h += u.rotationAngle;
  }

  let s = vec2f(u.size);
  var p = a.xy + vec2f(cos(h), sin(h)) * u.speed;
  p = p - floor(p / s) * s;
  agents[i] = vec4f(p, h, a.w);
  atomicAdd(&deposits[wrapIdx(vec2i(floor(p)))], 1u);
}
`;

const fieldWgsl = /* wgsl */ `
${common}
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
@group(0) @binding(3) var<storage, read_write> deposits: array<atomic<u32>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.size.x || id.y >= u.size.y) { return; }
  let p = vec2i(id.xy);
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      sum += src[wrapIdx(p + vec2i(dx, dy))];
    }
  }
  let i = wrapIdx(p);
  let v = mix(src[i], sum / 9.0, u.diffuse);
  let d = f32(atomicExchange(&deposits[i], 0u)) * u.deposit;
  dst[i] = (v + d) * u.decay;
}
`;

const drawWgsl = /* wgsl */ `
${common}
@group(0) @binding(1) var<storage, read> trail: array<f32>;

struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) i: u32) -> V {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: V;
  o.pos = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(xy.x, 1.0 - xy.y);
  return o;
}

@fragment
fn fs(in: V) -> @location(0) vec4f {
  let p = vec2i(floor(in.uv * vec2f(u.size)));
  let t = 1.0 - exp(-trail[wrapIdx(p)] * u.gain);
  let c = select(mix(u.inkA, u.inkB, (t - 0.5) * 2.0), mix(u.bg, u.inkA, t * 2.0), t < 0.5);
  return vec4f(c.rgb, 1.0);
}
`;

type Circle = { x: number; y: number; r: number };

function seedAgents(w: number, h: number): Float32Array {
  // the same packing as physarum/trail, laid over the square
  const scale = 0.5 * Math.min(w, h);
  const circles: Circle[] = pack({
    dimensions: 2,
    random: () => Random.value(),
    padding: 0.0025,
    minRadius: 0.03125,
    maxRadius: 0.25,
  }).map((s: { position: number[]; radius: number }) => ({
    x: w / 2 + s.position[0] * scale,
    y: h / 2 + s.position[1] * scale,
    r: s.radius * scale,
  }));

  const data = new Float32Array(config.count * 4);
  for (let i = 0; i < config.count; i++) {
    const c = circles[Random.rangeFloor(0, circles.length)];
    const a = Random.range(0, Math.PI * 2);
    data[i * 4] = c.x + Math.cos(a) * c.r;
    data[i * 4 + 1] = c.y + Math.sin(a) * c.r;
    data[i * 4 + 2] = Random.range(0, Math.PI * 2);
    data[i * 4 + 3] = 0;
  }
  return data;
}

const sketch: Sketch<'webgpu'> = async ({ wrap, context, width, height, ...props }) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error('No GPU adapter');
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });
  device.addEventListener('uncapturederror', (e) =>
    console.error('[gpu-million]', (e as GPUUncapturedErrorEvent).error.message),
  );
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const W = Math.floor(width);
  const H = Math.floor(height);
  const cells = W * H;

  const uniformBuf = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const agentBuf = device.createBuffer({
    size: config.count * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const trailBuf = device.createBuffer({
    size: cells * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const nextBuf = device.createBuffer({
    size: cells * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const depositBuf = device.createBuffer({
    size: cells * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const compute = (code: string) =>
    device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code }), entryPoint: 'main' },
    });
  const agentPipe = compute(agentWgsl);
  const fieldPipe = compute(fieldWgsl);
  const drawModule = device.createShaderModule({ code: drawWgsl });
  const drawPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: drawModule, entryPoint: 'vs' },
    fragment: { module: drawModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const bind = (pipe: GPUComputePipeline | GPURenderPipeline, bufs: GPUBuffer[]) =>
    device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [uniformBuf, ...bufs].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
  const agentBind = bind(agentPipe, [agentBuf, trailBuf, depositBuf]);
  const fieldBind = bind(fieldPipe, [trailBuf, nextBuf, depositBuf]);
  const drawBind = bind(drawPipe, [trailBuf]);

  const t0 = performance.now();
  const seed = seedAgents(W, H);
  console.log(`[gpu-million] seeded ${config.count} agents in ${Math.round(performance.now() - t0)}ms`);
  const uniforms = new ArrayBuffer(96);
  const writeUniforms = (frame: number) => {
    const u32 = new Uint32Array(uniforms);
    const f32 = new Float32Array(uniforms);
    u32.set([W, H, config.count, frame]);
    f32.set(
      [
        config.sensorAngle,
        config.rotationAngle,
        config.sensorDist,
        config.speed,
        config.deposit,
        config.decay,
        config.diffuse,
        config.gain,
      ],
      4,
    );
    f32.set([...rgb(bg), ...rgb(inkA), ...rgb(inkB)], 12);
    device.queue.writeBuffer(uniformBuf, 0, uniforms);
  };

  let step = 0;
  const simulate = (encoder: GPUCommandEncoder) => {
    const a = encoder.beginComputePass();
    a.setPipeline(agentPipe);
    a.setBindGroup(0, agentBind);
    a.dispatchWorkgroups(Math.ceil(config.count / WG));
    a.end();
    const f = encoder.beginComputePass();
    f.setPipeline(fieldPipe);
    f.setBindGroup(0, fieldBind);
    f.dispatchWorkgroups(Math.ceil(W / 16), Math.ceil(H / 16));
    f.end();
    encoder.copyBufferToBuffer(nextBuf, 0, trailBuf, 0, cells * 4);
  };

  // uniforms are read when a submit runs, so each step gets its own submit
  const runSteps = (n: number) => {
    for (let s = 0; s < n; s++) {
      writeUniforms(step++);
      const encoder = device.createCommandEncoder();
      simulate(encoder);
      device.queue.submit([encoder.finish()]);
    }
  };

  const reset = () => {
    device.queue.writeBuffer(agentBuf, 0, seed);
    const encoder = device.createCommandEncoder();
    encoder.clearBuffer(trailBuf);
    encoder.clearBuffer(depositBuf);
    device.queue.submit([encoder.finish()]);
    step = 0;
    runSteps(config.warmup);
  };
  reset();

  const draw = () => {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(drawPipe);
    pass.setBindGroup(0, drawBind);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  // A WebGPU canvas is only readable in the task that drew it, and ssam's
  // exportFrame reads it whenever it is called — so every export draws first.
  const exportNow = () => {
    draw();
    props.exportFrame();
  };
  import.meta.hot?.on('mcp:export', () => {
    exportNow();
  });
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 's') {
      e.preventDefault();
      e.stopImmediatePropagation();
      exportNow();
    }
  };
  window.addEventListener('keydown', onKey, { capture: true });
  import.meta.hot?.dispose(() => window.removeEventListener('keydown', onKey, { capture: true }));

  wrap.render = ({ frame }: WebGPUProps) => {
    if (frame === 0 && step > config.warmup) reset();
    runSteps(config.steps);
    draw();
  };
};

export const settings: SketchSettings = {
  mode: 'webgpu',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
  prefix: 'gpu-million-',
};

ssam(sketch, settings);

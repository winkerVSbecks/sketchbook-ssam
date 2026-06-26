# Working Notes

## Learner preferences
- Some shader experience, not GLSL-fluent. Reinforce shader concepts as they come up.
- Learns by doing — every lesson should end in something runnable in the ssam sketchbook.
- Wants to *author* new art, not only mechanically port. Favour understanding over transcription.

## Project grounding (verified 2026-06-22)
- ssam `0.22.0`; `@webgpu/types ^0.1.70` already in deps.
- WebGPU mode props: `WebGPUProps extends BaseProps<'webgpu'>` → `{ wrap, context: GPUCanvasContext, canvas, width, height, pixelRatio, playhead, ... }`. ssam hands you a configured-able `GPUCanvasContext`; **you** call `navigator.gpu.requestAdapter()` → `requestDevice()` → `context.configure(...)` and build the render pipeline yourself. (No existing webgpu sketch in repo — this will be the first.)
- Sketch file idiom (see `src/shader-sketches/basic.ts`): import `ssam` + types; define shaders as template strings; `const sketch: Sketch<'...'> = ({ wrap, canvas, width, height, pixelRatio }) => {...}`; HMR via `import.meta.hot.dispose/accept`; assign `wrap.render` / `wrap.resize` / `wrap.unload`; `const settings: SketchSettings = { mode, pixelRatio, animate, duration, playFps, ... }`; end file with `ssam(sketch, settings);`.
- `basic.ts` ALREADY uses the full-screen-triangle trick (OGL `Triangle`) with a clear ASCII diagram — good continuity for the WGSL version.
- `wrap.render({ playhead })` → playhead loops 0→1 over `duration`. Maps directly onto the torus's `time = mod(iTime/2., 1.)`.
- Loader caveat: `src/index.ts` types the module union as `Sketch<'2d' | 'webgl' | 'webgl2'>` — add `'webgpu'` there when wiring up the first webgpu sketch.
- Run a sketch: `VITE_SKETCH="<path-under-src>" npm run dev` (resolves `./<path>.ts` from `src/`).
- Vite has `vite-plugin-glsl`; WGSL has no special plugin — keep WGSL as template strings, or import a `.wgsl` file with `?raw`.

## Teaching plan (rough throughline — revise freely)
1. **Hello WGSL** — minimal `mode:'webgpu'` sketch: full-screen triangle + fragment shader outputting a uv gradient. (the plumbing)
2. **GLSL→WGSL syntax** — types, `let`/`var`, no implicit conversions, `select`, `atan2`, no `mod`, no `inout`. (the language)
3. **Uniforms** — time + resolution via uniform buffer + bind group; animate with playhead.
4. **One SDF + raymarch loop** — a sphere/torus marched, normals, basic shading. (the engine)
5. **Port the Clifford Torus** — stereographic projection, the 4D torus, domain repetition, fixDistance, spectrum palette. (the destination)

# Mission: Writing shaders in WebGPU (WGSL)

## Why
Author original generative art directly in WGSL, inside the existing ssam sketchbook. The goal is to move past GLSL/Shadertoy and be able to *invent* new pieces natively in WebGPU — and, when useful, port Shadertoy work like the Clifford Torus raymarcher into the real creative environment.

## Success looks like
- Run a hand-written WGSL fragment shader as an ssam `mode: 'webgpu'` sketch in the normal dev loop.
- Feed `time` + `resolution` (and other) uniforms into a shader and animate it.
- Read a chunk of GLSL and translate it to correct WGSL without guessing.
- Reproduce the Clifford Torus raymarcher as a running WebGPU sketch — understanding each piece, not just transcribing it.
- Start a brand-new piece from an empty WGSL shader without copy-pasting boilerplate blindly.

## Constraints
- **Background:** some shader experience, not GLSL-fluent — reinforce core shader ideas (uv, fragment shaders, SDFs) as they arise; don't assume them.
- **Host:** the ssam sketchbook. ssam `0.22.0`, `@webgpu/types` installed, `mode: 'webgpu'` supported (props expose a raw `GPUCanvasContext`; the sketch creates the device + pipeline itself).
- **Format:** short lessons, each a single tangible win, learned by doing in a real runnable sketch.

## Out of scope (for now)
- WebGPU **compute** shaders (particles, reaction-diffusion via storage buffers) — revisit once fragment-shader art is fluent.
- 3D mesh / vertex-buffer pipelines beyond the full-screen triangle.
- Performance tuning and multi-pass / ping-pong rendering.

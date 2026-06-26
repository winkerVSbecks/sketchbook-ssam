# Starting point: some shader experience, wants to author WGSL art in ssam

Established at kickoff (2026-06-22): the learner has *some* shader experience but is **not GLSL-fluent** — comfortable with the gist (uv, fragment shaders), not writing from scratch. Mission is to **author new generative art directly in WGSL** inside the ssam sketchbook (`mode: 'webgpu'`), using the Clifford Torus port as the learning vehicle/destination rather than the sole goal.

Implications for the zone of proximal development:
- Teach WGSL **syntax** and WebGPU **plumbing** explicitly — don't assume them.
- Conceptual shader ideas (uv mapping, SDFs, raymarching, normals) need *reinforcement* when reached, not full from-scratch teaching.
- Ground every lesson in a runnable ssam sketch; the learner learns by doing.
- ssam gives a raw `GPUCanvasContext` and you bring your own `device` — the host-side pipeline is part of what must be taught, not hidden.

See [[MISSION.md]]. Lesson 01 (Hello, WGSL) delivered the minimal pipeline + full-screen-triangle + uv-gradient as a real sketch (`src/shader-sketches/wgpu-hello.ts`). No demonstrated mastery yet — this record captures disclosed background only.

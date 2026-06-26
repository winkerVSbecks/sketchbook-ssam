# Clifford Torus fully ported — core course arc complete

Evidence (Lesson 05): the learner ported `pMod2` + `glslMod2` perfectly on the first try — the shader's hardest translation, combining all three WGSL hazards at once: `inout` → `ptr<function, vec2f>` (correct deref + write-through), mutate-**and**-return, and `mod` → negative-safe `glslMod2`. No errors.

Across the five lessons the learner personally ported every non-trivial piece of the Clifford Torus shader: `spectrum`/`pal`, `pR`, `fTorus` (3D), and `pMod2`/`glslMod2` — and independently wrote the full uniform plumbing (Lesson 03) and swapped SDFs in the raymarcher (Lesson 04). The assembled sketch is `src/shader-sketches/wgpu-clifford.ts`.

MISSION status: the success criteria are essentially met — can run hand-written WGSL in ssam, feed uniforms/time, translate GLSL→WGSL fluently, and reproduced the Clifford Torus as a running WebGPU sketch. The remaining stated goal ("start a brand-new piece from an empty WGSL shader") is the natural next focus.

Implications / where to go next:
- WGSL syntax and the fragment-shader pipeline are **owned**. Stop teaching mechanics.
- Open questions for future sessions (learner's choice): authoring an *original* piece from scratch; multi-pass / ping-pong feedback; or stepping into **compute shaders** (currently out of scope in [[MISSION.md]] — revisit). The "no live community vetted" gap in [[RESOURCES.md]] is also worth closing now that they have work to share (compute.toys).
- If the Clifford render shows speckles at the inner edge, the only knob is the 300-step march count (raise toward 400); not a comprehension gap.

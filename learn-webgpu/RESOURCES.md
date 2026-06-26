# WebGPU / WGSL Resources

Curated and verified 2026-06-22 against live docs. Knowledge is drawn from here, not from memory.

## Knowledge

- [WebGPU Fundamentals — "Fundamentals"](https://webgpufundamentals.org/webgpu/lessons/webgpu-fundamentals.html) ⭐ **best beginner primary source**
  Clearest start-to-finish walkthrough of device → pipeline → render-pass in current WGSL. Use for: the whole host-side flow behind Lesson 01.
- [WebGPU Fundamentals — "WGSL"](https://webgpufundamentals.org/webgpu/lessons/webgpu-wgsl.html)
  The language itself: `let`/`var`/`const`, strict types, vector aliases, swizzles, `select`, control flow. Use for: the GLSL→WGSL mental switch (Lesson 02).
- [WebGPU Fundamentals — "WGSL Function Reference"](https://webgpufundamentals.org/webgpu/lessons/webgpu-wgsl-function-reference.html)
  Every builtin with exact signature. Use for: "does WGSL have `mod`? (no)", `atan2`, `inverseSqrt`, `smoothstep`, `mix`.
- [WebGPU Fundamentals — "Inter-stage Variables"](https://webgpufundamentals.org/webgpu/lessons/webgpu-inter-stage-variables.html)
  How `@location` varyings flow vertex → fragment. Use for: understanding the `VSOut` struct.
- [WebGPU Fundamentals — "Data Memory Layout"](https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html)
  Alignment/padding rules (the `vec3` = 16-align/12-size trap). Use for: getting uniform structs right (Lesson 03) — the #1 "garbled uniform" bug.
- [WGSL Specification (W3C)](https://www.w3.org/TR/WGSL/)
  Normative spec. Final word on operator semantics (incl. exact `%` float behaviour), builtin overloads, address spaces. Use for: settling any "is this really legal?" question.
- [MDN — WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
  Reference for the JS host API. Use for: exact method signatures — `GPUCanvasContext.configure()`, `getPreferredCanvasFormat()`, `createRenderPipeline()`.
- [Google — "Tour of WGSL"](https://google.github.io/tour-of-wgsl/)
  Interactive, runnable syntax tour. Use for: poking at `ptr<…>` pointers and `let`/`var` live (relevant to porting `inout`).
- [Google Codelab — "Your first WebGPU app"](https://codelabs.developers.google.com/your-first-webgpu-app)
  Canonical hands-on build (Conway's Life: render + compute), vanilla JS. Use for: a second full worked example, and a first taste of compute (out of scope for now).
- [Maxime Heckel — "Painting with Math: A Gentle Study of Raymarching"](https://blog.maximeheckel.com/posts/painting-with-math-a-gentle-study-of-raymarching/)
  Conceptual SDF/raymarching intuition (shaders are Three.js/TSL, not raw WGSL). Use for: reinforcing the *ideas* behind the torus march when we reach it.

## Wisdom (Communities)

- [compute.toys](https://compute.toys)
  "Shadertoy for WebGPU" — browser playground + the de-facto WGSL shader community. Use for: reading idiomatic shader-style WGSL and sharing/finding pieces. (Compute-pipeline based, not the fragment pipeline ssam uses — read for language idioms, not exact plumbing.)
- r/GraphicsProgramming — high-signal subreddit for shader/raymarching technique critique. *(Candidate — not yet vetted this session.)*

## Gaps

- **Live chat community not yet vetted.** A WebGPU-specific Matrix/Discord (e.g. the W3C "GPU for the Web" group) likely exists but I haven't confirmed a current, well-moderated invite link — flag for a future session before recommending.
- **WGSL spec was unreachable** during research (fetch sandbox blocked w3.org). One fact — exact float semantics of `%` (truncated vs floored) — is therefore *unconfirmed against primary source*; the cheat-sheet sidesteps it with a `glslMod` helper. Confirm against [the spec](https://www.w3.org/TR/WGSL/) when convenient.
- **No raw-WGSL raymarching tutorial found.** Most SDF/raymarch tutorials are GLSL or Three.js. We bridge that gap ourselves in the later lessons.

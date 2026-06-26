# Raymarch engine understood; can read/extend an SDF scene

Evidence (Lesson 04): given a complete, commented sphere raymarcher, the learner correctly ported the 3D `fTorus` SDF and swapped it into `map` — producing a tumbling 3D torus. Port was clean (signature, `.xz` swizzle-read, `length`/`vec2`), and they correctly placed it so the pre-wired `pR`+`u.time` rotation drives it.

Notable: used **bare `vec2(...)`** (element type inferred from the f32 args) rather than `vec2f(...)` — valid WGSL, shows growing comfort with the type system (same abstract→concrete inference seen with literals).

Implications:
- The raymarching mental model (SDF → ray → sphere-trace loop → gradient normal → shade) is now grounded by doing, not just reading. Can extend scenes by writing/swapping SDFs.
- WGSL syntax is no longer the bottleneck — the learner ports fluently. Future teaching can focus on **technique/math** (the Lesson 05 stereographic projection) rather than language mechanics.
- Still ahead and genuinely new: the 4D inverse-stereographic projection, `pMod2` (the `inout` + `mod` port → first real use of `glslMod`), and `fixDistance`. See [[MISSION.md]].

4 of 5 torus pieces in hand: palette, rotation, uniforms/time, and now the raymarch engine + 3D torus SDF. Lesson 05 assembles the real thing.

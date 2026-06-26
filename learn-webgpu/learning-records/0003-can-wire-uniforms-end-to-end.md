# Can wire a uniform end-to-end (host + shader), unprompted

Evidence (Lesson 03): given only the host-plumbing as a *reference*, the learner wired the **entire** uniform path themselves in `wgpu-spectrum.ts` — and correctly:
- WGSL `struct Uniforms { resolution: vec2f, time: f32 }`, packed to a clean 16 bytes.
- The binding line `@group(0) @binding(0) var<uniform> u: Uniforms;` reproduced **exactly from memory** — the one piece of new syntax.
- `fs` driven by time: `pR(&p, 6.28318 * u.time)` (full-turn scaling, pointer still correct).
- Host side: buffer `size:16` + `UNIFORM|COPY_DST`, bind group via `getBindGroupLayout(0)`, `Float32Array(4)` with `[3]` correctly understood as padding, `writeBuffer` per-frame, `setBindGroup` before `draw`.
- Earlier, answered the alignment/padding reasoning correctly without peeking.

Implications:
- The CPU↔GPU uniform pattern is **owned**, not just followed. No need to re-drill basic uniforms; can introduce more fields / second bind groups as needed later.
- Address-space concept (`function` for pointers, `uniform` for buffers) has clicked across two contexts now.
- Pointer-type syntax (the [[0002-can-port-pure-functions]] gap) did NOT recur — `&p` + `ptr<function,vec2f>` used correctly again.
- Ready for **Lesson 04 — raymarching an SDF**: the conceptual jump from 2D screen-space to a 3D ray loop, where the real shader-math teaching (not WGSL syntax) becomes the focus. See [[MISSION.md]].

3 of 5 torus pieces now in hand: palette, rotation, and the time/uniform machinery to animate them.

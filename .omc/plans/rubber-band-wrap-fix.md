# Plan: Fix Rubber-Band Wrap Geometry in `wrap.ts`

Target file: `src/sketches/rubber-band-stipple/wrap.ts`.

## Problem

Two related bugs, both visible in the reference frames (`output/2026.05.22-11.30.50.png`, `…11.30.53.png`, `…11.31.01.png`):

1. **The band crosses circles.** The current path is built by angular-sorting all peg centers around a frozen centroid and connecting consecutive pegs with external tangents. Whenever a peg sits inside the angular hull, the tangent segment passes *through* other pegs — visible as X-crossings in the output.
2. **The band snaps as pegs drift.** A circle can be untouched by the band one frame and tangent-wrapped the next, with no smooth transition. The intent is "circles are pegs, the path is a rubber band; if a peg moves, the band stretches with it — it never jumps from not-wrapped to wrapped."

Root cause: a single angular order + external-tangent rendering does not encode rubber-band physics. Interior pegs need different tangent geometry than hull pegs; pegs the band shouldn't touch still need to be treated as obstacles.

## Design (decided in interview)

The new band is a **single closed non-self-intersecting curve** built from three peg roles, all frozen at sketch init:

| Role | Source | Band contact |
|---|---|---|
| **Hull peg** | On the convex hull of the inflated disks | Convex arc (band wraps from outside) |
| **Dented interior peg** | Randomly selected from interior pegs at init, count = `config.dentCount` | Concave arc (band dips inward to embrace) |
| **Floater** | The remaining interior pegs | None *intentionally*. Treated as obstacles — incidental convex contact only if the band's tangent line would otherwise cross them |

**Frozen at init** (never recomputed during animation):
- Hull membership (which pegs are convex)
- Dent subset (which interior pegs get concave dents)
- Angular order of `hull ∪ dented` around the init centroid

This is what guarantees "no jumps": pegs don't change roles mid-animation, and the order doesn't reshuffle. Per-frame work is purely geometric — pegs drift, tangents recompute, but the band's *identity* is fixed.

**Floater handling** preserves "no crossings" without breaking "no jumps": as a floater drifts toward the band's tangent segment, the incidental convex contact grows smoothly from zero arc length. As it drifts away, the contact shrinks back to zero and disengages. The band's *outline* is C⁰-continuous across these events — the only thing that "appears/disappears" is a zero-length tangency, which is invisible.

**Control surface**: one new tweakpane param, `dentCount: integer`, clamped at runtime to the number of interior pegs. All other config preserved as-is.

## Algorithm

### Init (runs once per topology change — i.e., when `count` or `maxR` changes, same trigger as the existing `cacheKey`)

1. Generate peg positions (existing Poisson-ish rejection sampling).
2. Compute the **convex hull of the inflated disks** (each peg radius padded by `halfCS`). Hull pegs become `convex`-role; the remainder are `interior`.
3. Randomly pick `min(config.dentCount, interior.length)` interior pegs using the existing seeded `Random`. These get `concave` role. The rest are `floater` role.
4. Angular-sort the union of `convex` and `concave` pegs around the init centroid → frozen `contactOrder`. Floaters are not in this list.
5. Cache: `roles[i]: 'convex' | 'concave' | 'floater'`, `contactOrder: number[]`, `floaterIndices: number[]`.

Cache key needs to incorporate `dentCount` so changing the slider re-rolls the selection.

### Per-frame render

1. Update peg positions: noise drift + relax iterations (existing).
2. Build `intentionalContacts = contactOrder.map(i => inflated(circles[i]))` and `floaters = floaterIndices.map(i => inflated(circles[i]))`.
3. For each adjacent pair `(A, B)` in `intentionalContacts` (cyclic):
   a. Compute the **role-aware tangent** from A's exit to B's entry (see "Tangent math" below).
   b. **Detour pass**: walk the tangent segment, find floaters whose center lies within `r + halfCS` of the segment, sort them by parametric `t` along the segment, and splice them in as incidental convex contacts. Each insertion replaces one tangent segment with two new tangent segments that each must be re-checked for further floater intersections (recurse, bounded by total floater count).
4. For each contact peg in the final expanded order, compute its arc:
   - Arrival angle from the prior segment's tangent endpoint.
   - Departure angle to the next segment's tangent endpoint.
   - **Sweep direction**: convex contacts sweep one way around the centroid (e.g. the "short" arc on the outward side); concave contacts sweep the other (the "short" arc on the inward side). Use a signed cross-product test against the prior/next tangent direction rather than trusting `Math.atan2` ordering.
5. Emit one `ctx.Path2D` (or direct `beginPath`/`arc`/`lineTo`/`closePath`): tangent endpoint → arc on contact → next tangent endpoint → ... → `closePath`.
6. Stroke with the existing multi-layer bevel rendering. Stipple/dot pass over all `circles` is unchanged (every peg still gets gradient + center dot + rims).

### Tangent math

Current `getTangentPoints` only solves the **external tangent on the perpRight side** — correct for convex↔convex. Need the full table:

| A role | B role | Tangent | Geometry |
|---|---|---|---|
| convex | convex | external (one side) | existing `getTangentPoints`, perpRight |
| convex | concave | crossed | band exits A on the outside, enters B on the inside |
| concave | convex | crossed (mirror) | band exits A on the inside, enters B on the outside |
| concave | concave | internal | band stays on the inside of both |

All four are determinable from the same `a = (r_A ± r_B) / d`, `b = √(1 - a²)` decomposition the current code uses for the unequal-radii case — the signs of `a` and `b` and the choice of `right` vs `-right` flip with the role pair.

**Incidental floater contacts** are always convex from the band's frame (the band wraps around the obstacle), so they slot in as convex pegs at the recursion step. The side of the floater the band passes is the side that produces a shorter detour (signed cross-product of the original segment direction against the floater center offset).

### Convex hull of disks

For the inflated disk set:
- Standard Andrew's monotone chain on disk centers gives an O(n log n) approximation, but it's wrong for very unequal radii (a big disk dominates even when not "outermost" by center).
- Correct method: compute the upper/lower envelope on the inflated disks using the "Apollonius hull" algorithm — but for `count ≤ 60` (the tweakpane max), the simpler approach is fine: take the hull of centers, then post-pass to verify each non-hull peg's inflated disk is fully contained in the convex hull of the inflated hull pegs. If any peg's disk pokes out, add it to the hull and re-traverse.
- For this sketch's scale, the centers-only hull is acceptable as a v1 with a note. Revisit if visual artifacts appear with wide `(minR, maxR)` spread.

## Implementation Steps

### Step 1 — Math helpers (new module section in `wrap.ts`)

- Add `Role = 'convex' | 'concave' | 'floater'`.
- Generalize `getTangentPoints(c1, c2, side1, side2)` where `side ∈ {'outside','inside'}`. Existing call sites pass `('outside','outside')`.
- Add `signedDistanceToSegment(p, a, b): number`.
- Add `intersectSegmentDisk(a, b, c, r): { t: number } | null` (parametric hit).
- Add `convexHullOfDisks(circles): number[]` returning indices of hull pegs in CCW order (centers-only hull is OK for v1; document the limitation in a one-line comment if and only if needed for a future reader — otherwise omit per project comment policy).

### Step 2 — Init / cache invalidation

- Extend `cacheKey` to `${config.count}|${config.maxR}|${config.dentCount}`.
- Inside `ensurePositions`, after generating `positions`:
  - Build provisional inflated circles using `config.maxR + halfCS` as an upper bound for hull computation (positions only, before per-frame radius modulation — the hull is a *topological* selection, not a per-frame geometric one).
  - Run `convexHullOfDisks` → `hullIndices`.
  - Compute `interiorIndices = setDifference(allIndices, hullIndices)`.
  - Shuffle `interiorIndices` with seeded `Random.shuffle`, take the first `min(config.dentCount, interiorIndices.length)` as `dentedIndices`, remainder as `floaterIndices`.
  - Build `roles: Role[]` and `contactOrder` (angular sort of `hullIndices ∪ dentedIndices` around the init centroid).
  - Cache all of the above.

### Step 3 — Replace `rubberBandPath`

New signature/responsibility:
```ts
function rubberBandPath(
  ctx: CanvasRenderingContext2D,
  contacts: { circle: Circle; role: 'convex' | 'concave' }[],
  floaters: Circle[],
): void
```

Algorithm:
1. For each cyclic pair `(contacts[i], contacts[i+1])`, compute the role-aware tangent endpoints.
2. Detour expansion: gather floaters intersecting the tangent segment (using `r_floater + halfCS` and `halfCS` band thickness padding), sort by `t`, recursively splice each as a convex contact between the pair. Cap recursion at `floaters.length` to avoid pathological loops.
3. After expansion, the full contact ring is `[c0, c1, c2, ...]` of convex/concave pegs with computed arrival/departure tangent endpoints.
4. Emit the path: `moveTo(prevTangent.t2)`, then for each contact `arc(c.x, c.y, c.r, arrivalAngle, departureAngle, ccw)`, `lineTo(thisTangent.t2)`, finally `closePath`.

CCW flag per contact derived from `sign(cross(arrivalDir, departureDir))`.

### Step 4 — Tweakpane

- Add `dentCount: 4` to `config`.
- Add `pane.addBinding(config, 'dentCount', { min: 0, max: 60, step: 1 })`.
- Place it between `count` and `minR` so related controls cluster.

### Step 5 — Render loop integration

In `wrap.render`:
- After collision relax + halo construction, build `contacts` from `contactOrder` (mapping `roles[i]` to `'convex' | 'concave'`) and `floaters` from `floaterIndices`.
- Call `rubberBandPath(context, contacts, floaters)`.
- Keep `hullFill`, `bevelLayers`, `bevelStrength`, and the stipple loop unchanged.

### Step 6 — Self-intersection sanity check (dev only, optional)

Add a debug guard that asserts the constructed Path2D has no self-intersections under a known seed. Behind a `config.debug` flag, off by default. Skip if cost-prohibitive — visual inspection is the primary verifier.

## Acceptance Criteria

1. **No crossings**: at no playhead value does any rendered path stroke cross the interior of any circle. Verified by visual inspection across the full 8s loop at three different `Random.setSeed` values.
2. **No jumps**: scrubbing the playhead, every hull peg and every dented interior peg is *always* in contact with the band. No frame has a peg transitioning from non-contact to contact (except floaters, which may show arbitrarily small tangent grazes — those don't count).
3. **`dentCount` works**: setting `dentCount = 0` renders the pure convex hull of disks. Setting `dentCount = interiorCount` dents every interior peg. Intermediate values produce a stable random subset that doesn't change frame-to-frame.
4. **Existing aesthetics preserved**: stipple pass, bevel stroke layering, gradient, dot/rim treatment all visually identical to current output for hull pegs.
5. **Stable under drift**: at `driftFactor` up to 0.05 (twice current default), the band still has zero crossings and zero peg transitions. Above that the algorithm is "best effort" — document if degradation appears.
6. **No new TS errors** from `tsc --noEmit`. No new runtime exceptions.

## Verification

- Visual: render the loop at three seeds; capture frames at playhead `[0, 0.25, 0.5, 0.75]` for each. Inspect each for crossings and for any peg that should be wrapped but isn't.
- Edge cases to scrub:
  - `count = 3` (degenerate hull — triangle, no interior).
  - `count = 60, dentCount = 0` (pure hull of disks, dense pegs).
  - `count = 16, dentCount = 16` (more dents than possible — should clamp).
  - `minR = maxR = 80` (uniform radii — test the simpler tangent branch is still hit).
  - `minR = 8, maxR = 280` (wide radius spread — stresses convex-hull-of-disks correctness).

## Out of Scope

- Animating `dentCount` smoothly (changing it re-rolls the selection, which IS a jump — by design, since it changes topology).
- Switching from random subset selection to closest-to-hull or largest-radius rules. Random was the chosen rule.
- Obstacle-aware tangents for pegs that are *not* floaters (i.e., big disks wedged between two hull pegs that geometrically prevent a tangent). Treat as edge case; if it surfaces during verification, address as a follow-up.
- Refactoring the bevel/stipple rendering. Pure geometry fix.

## Risks

- **Convex-hull-of-disks correctness** for very unequal radii. Mitigation: use the centers-only hull plus a "disk poke-out" verification pass. Falls back gracefully even if the verification pass is omitted in v1.
- **Detour recursion explosion** if many floaters cluster on a long tangent segment. Mitigation: hard recursion cap = `floaters.length` (a single segment can only acquire each floater once). At `count = 60` and typical floater density, this is bounded and fast.
- **Concave arc sweep direction errors** producing inside-out wraps. Mitigation: cross-product sign test on tangent directions, not `atan2` comparison. Add a debug visualization if needed during implementation.

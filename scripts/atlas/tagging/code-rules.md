# Code-tagging rules

You are cataloguing generative-art sketches in the repo `/Users/varun/Documents/projects/sketchbook-ssam` (a personal sketchbook built on the ssam framework) so the artist can map his whole body of work on an infinite canvas.

For EACH sketch in your list: Read its source file, understand what it draws and how, and produce one record. If the file imports sibling modules from its own folder or shared homegrown engines (e.g. anything under `src/nalee` or a series-local engine file) and the main file alone is unclear, skim those too — but stay efficient. Many sketches build on a homegrown flow/space-filling system called "nalee"; when a sketch uses a shared homegrown system, name it in `system`.

## Record shape (JSON)

```json
{
  "id": "<exactly as given in the list>",
  "description": "<=140 chars, concrete: what it draws + the method. e.g. 'Chladni nodal lines rendered as an ascii glyph field over near-black ground'. No marketing tone.",
  "concepts": ["2-5 tags: the idea being explored"],
  "techniques": ["2-6 tags: algorithms/methods actually used"],
  "forms": ["2-5 tags: shapes you would see"],
  "medium": "canvas2d | webgl | webgpu | shader | penplot | dom | mixed",
  "motion": "static | animated | interactive",
  "palette": "one tag: color source",
  "influences": ["only when clearly referenced by name; else []"],
  "system": "shared homegrown engine used (nalee, clixo, heerich, ...) — omit if none",
  "notable": "one short observation worth remembering — omit if nothing stands out"
}
```

## Tag rules

All tags lowercase-kebab-case. PREFER these controlled vocabularies; add free tags only when nothing fits:

- **concepts**: grid-study, color-study, optical-vibration, order-vs-chaos, emergence, weaving-structure, textile, negative-space, systematic-variation, found-composition, minimalism, concrete-art, op-art, architecture, typography, self-reference, landscape, figuration, music-rhythm, chance-operations, process-as-image, homage, tool-study
- **techniques**: noise-field, flow-field, particle-system, verlet-physics, spring-physics, collision, boids, cellular-automata, game-of-life, wave-function-collapse, physarum, dla, diffusion, reaction-diffusion, circle-packing, poisson-disk, voronoi, delaunay, convex-hull, quadtree, space-filling, maze-generation, pathfinding, distance-field, chaikin-smoothing, recursive-subdivision, fractal, l-system, truchet-tiles, tiling, isometric-projection, raycasting, ray-marching, sdf, conformal-mapping, domain-warping, trig-waves, lissajous, xor-pattern, modulo-pattern, dithering, halftone, hatching, stippling, pixel-manipulation, image-sampling, feedback-loop, ascii-render, shader, gradients, clipping-mask
- **forms**: grid, lines, stripes, bands, circles, arcs, rectangles, triangles, polygons, hexagons, curves, blobs, dots, spirals, waves, letterforms, glyphs, ribbons, cells, tiles, voxels, isometric-blocks, windows, stairs, mesh, field
- **medium**: three/ogl imports = webgl; wgsl or webgpu mode = webgpu; glsl/lygia as the core renderer = shader; plotter/penplot export = penplot; otherwise canvas2d
- **motion**: `animate: false` or single-frame render = static; mouse/keyboard driving the image = interactive; else animated
- **palette** examples: riso-colors, chromotome, texel, rybitten, pro-color-harmonies, radix, clrs, paper-colors, custom-hex, monochrome, black-and-white, found-colors, image-derived, generated
- **influences**: only when clearly referenced by name in file/folder/comments (e.g. anni-albers, ellsworth-kelly, sol-lewitt, bridget-riley, vera-molnar, erwin-heerich, robert-swain, wallace-sewell, siep-van-den-berg, samantha-bittman, todd-kelly)

## Output

Write the complete JSON array (one record per sketch — ALL sketches in your list, ids EXACTLY as given) to your assigned output file using the Write tool. Then VALIDATE it parses:
`python3 -c "import json; print(len(json.load(open('<your output file>'))))"` — fix if it fails.
Reply with a single line: `WROTE <n> records`.

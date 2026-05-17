# Sketchbook-SSAM Project Guide

## Commands
- Run a sketch: `VITE_SKETCH="sketches/<sketch_path>" npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Archive
- `npm run archive` — incremental: renders only sketches whose last git commit changed (or new ones), uploads PNGs to Cloudinary, regenerates `archive.json` + `./archive/index.html`.
- `npm run archive:site` — regenerate the static site from existing `archive.json` only (no rendering or uploads). Useful for tweaking HTML/CSS.
- `npm run archive:force` — re-render and re-upload every sketch.
- `npm run archive -- --only <substr>` — restrict to sketches whose id contains the substring.
- `npm run archive -- --dry-run` — print the plan without rendering.
- Requires `.env` at repo root with `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`.

## Code Style Guidelines
- **TypeScript**: Use strict typing with interfaces/types for complex objects
- **Imports**: Group by external libraries first, then project modules
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Sketch Structure**: Follow patterns in existing sketches using ssam's `SketchProps` and `SketchSettings`
- **Canvas Drawing**: Use context operations with appropriate type annotations
- **Error Handling**: Use optional chaining and nullish coalescing for potential nulls
- **Comments**: Document complex algorithms or non-obvious implementations
- **Color Management**: Use existing color utilities from project (clrs, texel-colors)
- **Animation**: When animating, use requestAnimationFrame-compatible approaches

SSAM is a generative art framework - reference existing sketches when creating new ones.
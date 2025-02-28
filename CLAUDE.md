# Sketchbook-SSAM Project Guide

## Commands
- Run a sketch: `VITE_SKETCH="sketches/<sketch_path>" npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

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
import type { Sketch, SketchSettings } from 'ssam';

type SsamSketchModule = {
  sketch: Sketch;
  settings: SketchSettings;
};

const importedModule: SsamSketchModule = await import(
  // defined in env via CLI
  `./sketches/${import.meta.env.VITE_SKETCH}.ts`
);

import type { Sketch, SketchSettings } from 'ssam';

type SsamSketchModule = {
  sketch: Sketch<'2d' | 'webgl' | 'webgl2'>;
  settings: SketchSettings;
};

const importedModule: SsamSketchModule = await import(
  // defined in env via CLI
  /* @vite-ignore */
  `./${import.meta.env.VITE_SKETCH}.ts`
);

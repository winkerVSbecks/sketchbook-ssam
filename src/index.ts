import type { Sketch, SketchSettings } from 'ssam';

type SsamSketchModule = {
  sketch: Sketch<'2d' | 'webgl' | 'webgl2'>;
  settings: SketchSettings;
};

type ReadyWindow = Window & { __ssam_ready?: boolean };

if (import.meta.env.DEV) {
  (window as ReadyWindow).__ssam_ready = false;
}

const importedModule: SsamSketchModule = await import(
  // defined in env via CLI
  /* @vite-ignore */
  `./${import.meta.env.VITE_SKETCH}.ts`
);

if (import.meta.env.DEV) {
  const w = window as ReadyWindow;
  const armReadySignal = () => {
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          w.__ssam_ready = true;
        }),
      );
      return;
    }
    requestAnimationFrame(armReadySignal);
  };
  requestAnimationFrame(armReadySignal);

  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => {
      w.__ssam_ready = false;
      requestAnimationFrame(armReadySignal);
    });
  }
}

void importedModule;

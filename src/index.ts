import type { Sketch, SketchSettings } from 'ssam';

type SsamSketchModule = {
  sketch: Sketch<'2d' | 'webgl' | 'webgl2'>;
  settings: SketchSettings;
};

type ReadyWindow = Window & { __ssam_ready?: boolean };

const EXPORT_WARMUP_MS = 2_000;

if (import.meta.env.DEV) {
  (window as ReadyWindow).__ssam_ready = false;
}

const params = new URLSearchParams(location.search);
const sketchPath = params.get('sketch') ?? import.meta.env.VITE_SKETCH;
const galleryMode = params.has('gallery');

if (galleryMode) {
  const style = document.createElement('style');
  style.textContent = '.tp-dfwv { display: none !important; }';
  document.head.appendChild(style);
}

const importedModule: SsamSketchModule = await import(
  /* @vite-ignore */
  `./${sketchPath}.ts`
);

if (import.meta.hot) {
  import.meta.hot.on('mcp:export', async () => {
    // Animated sketches export the first frame unless we let ssam play first;
    // give it a fixed warm-up so stateful sims accumulate something visible.
    if (importedModule.settings.animate !== false) {
      await new Promise((resolve) => setTimeout(resolve, EXPORT_WARMUP_MS));
    }
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
}

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

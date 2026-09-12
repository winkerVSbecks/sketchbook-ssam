import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { createShell, roundRectPath, theme, type Camera, type SceneView } from '__UI_IMPORT__';

const INK = '#8a5cf5';

export const sketch = ({ wrap, context, canvas, width, height, pixelRatio, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      shell.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // The shell draws the grid rulers, toolbar, parameter window and loupe, and
  // wires pointer, gestures (wheel pans, ⌃-wheel / pinch zooms) and keyboard:
  // `h` restores closed windows, `r` resets the view, `Esc` hides the loupe.
  // See src/ui/shell.ts for every option (`gestures: false`, `readout: true`, `handles`…).
  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: __COLS__, subdivisions: __SUBDIVISIONS__, xOrigin: 'right' },
    modes: __MODES__,
    params: __PARAMS__,
    loupe: __LOUPE__,
    onChange: () => props.render(),
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      shell,
      camera: shell.camera,
      loupe: shell.loupe,
      repaint: () => props.render(),
    };
  }

  // ---------------------------------------------------------------------------
  // Replace this: draw your subject in world space (1 unit = 1 grid cell).
  // `view.params` holds the slider values, `view.mode` the active toolbar mode,
  // and `view.magnified` is true inside the loupe — use it to restyle the
  // magnified view (hatched fill, nodes, measurements…). Multiply pixel-valued
  // params by `shell.px` to convert them to world units.
  // ---------------------------------------------------------------------------
  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const size = __SIZE_EXPR__;
    const c = shell.camera.fitCenter;

    ctx.save();
    cam.apply(ctx);
    roundRectPath(ctx, { x: c.x - size / 2, y: c.y - size / 2, w: size, h: size }, size * 0.12);
    ctx.restore();

    ctx.fillStyle = view.magnified ? shell.hatch(INK) : INK;
    ctx.fill();
    if (view.magnified) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.ink;
      ctx.stroke();
    }
  };

  wrap.render = () => shell.render(drawScene);
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [__WIDTH__, __HEIGHT__],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

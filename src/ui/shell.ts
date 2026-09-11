import { createCamera, type Camera } from './camera';
import { attachCameraGestures } from './gestures';
import { drawGridLines, drawGridMarkers, gridMarkersInnerRect, gridStep, type GridMarkersOptions } from './grid-markers';
import { createLoupe, type Loupe } from './loupe';
import { attachPointer } from './pointer';
import { createRangeGroup, type RangeOptions } from './range';
import { createToggleGroup, icons, type IconPainter, type ToggleGroup } from './toggle';
import { contains, labelFont, theme, type Rect } from './types';
import { createUI, type UI } from './ui';
import { createWindow, type Window } from './window';

export interface ShellMode {
  id: string;
  /** A built-in icon name or a custom painter. */
  icon: keyof typeof icons | IconPainter;
}

export interface SceneView {
  /** True when drawing inside the loupe. */
  magnified: boolean;
  /** Lens magnification (1 outside the loupe). */
  magnification: number;
  /** Active mode id, or null when the shell has no modes. */
  mode: string | null;
  /** Current parameter values by id. */
  params: Record<string, number>;
}

export type DrawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => void;

export interface ShellOptions {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pixelRatio?: number;
  /** Canvas background; also used to knock out ruler numerals. */
  background?: string;
  grid?: Partial<Pick<GridMarkersOptions, 'cols' | 'subdivisions' | 'margin' | 'xOrigin' | 'yOrigin'>>;
  /** Exclusive render modes shown as toolbar toggles. Omit for no mode buttons. */
  modes?: ShellMode[];
  /** Parameters shown as range sliders in the panel window. */
  params?: RangeOptions[];
  /** Loupe (magnifier) — enabled by default; pass `false` to remove it. */
  loupe?: false | { radiusFactor?: number; steps?: number[]; magnification?: number };
  /**
   * Whole-canvas pan/zoom on the grid: wheel pans, ⌃-wheel / trackpad pinch zooms
   * about the cursor, two-finger touch pinch zooms and pans; `r` resets the view.
   * Ignored over windows and the loupe. Enabled by default; pass `false` to remove it.
   */
  gestures?: false | { wheelZoomSpeed?: number };
  /** Tabular readout of the parameters, top-right of the grid (default true). */
  readout?: boolean;
  toolbar?: { x?: number; y?: number };
  panel?: { x?: number; y?: number; width?: number };
  /** Called whenever the UI changes something — wire to `props.render`. */
  onChange: () => void;
}

export interface Shell {
  readonly camera: Camera;
  /** The grid area in screen space (the camera viewport). */
  readonly inner: Rect;
  /** World units per screen pixel at the fit view — multiply pixel-valued params by this. */
  readonly px: number;
  readonly params: ReturnType<typeof createRangeGroup>;
  /** Active mode id (null when no modes were configured). */
  readonly mode: string | null;
  readonly loupe: Loupe | null;
  readonly ui: UI;
  readonly windows: { toolbar: Window | null; panel: Window | null };
  readonly grid: GridMarkersOptions;
  /** Paint one frame: background, grid, `drawScene` (outside and, if visible, inside the loupe), readout, UI. */
  render(drawScene: DrawScene): void;
  /** Dot-hatched pattern in `color`, for the magnified look. Cached per colour. */
  hatch(color: string): CanvasPattern | string;
  dispose(): void;
}

/**
 * Assemble the standard canvas-UI chrome — grid rulers, toolbar, parameter
 * window, loupe, readout, pan/zoom gestures, pointer + keyboard wiring — so a
 * sketch only has to draw its subject. See `src/sketches/canvas-ui/controls-demo.ts` for a full
 * example and the `create-ui-sketch` skill for a template.
 */
export function createShell({
  ctx,
  canvas,
  width,
  height,
  pixelRatio = 1,
  background = '#f6f6f5',
  grid: gridOpts = {},
  modes = [],
  params: paramOpts = [],
  loupe: loupeOpts = {},
  gestures: gestureOpts = {},
  readout = true,
  toolbar: toolbarPos = {},
  panel: panelPos = {},
  onChange,
}: ShellOptions): Shell {
  const grid: GridMarkersOptions = {
    width,
    height,
    margin: gridOpts.margin ?? 44,
    cols: gridOpts.cols ?? 4,
    rows: gridOpts.cols ?? 4,
    subdivisions: gridOpts.subdivisions ?? 6,
    xOrigin: gridOpts.xOrigin ?? 'right',
    yOrigin: gridOpts.yOrigin ?? 'bottom',
    paper: background,
  };
  const inner = gridMarkersInnerRect(grid);
  const camera = createCamera({
    viewport: inner,
    units: grid.cols,
    flipX: grid.xOrigin === 'right',
    flipY: grid.yOrigin !== 'top',
  });
  const px = 1 / camera.fitScale;
  const size = (): [number, number] => [width, height];

  // --- Controls ---------------------------------------------------------------
  const modeGroup: ToggleGroup | null = modes.length
    ? createToggleGroup({
        items: modes.map((m) => ({
          id: m.id,
          drawIcon: typeof m.icon === 'string' ? icons[m.icon] : m.icon,
        })),
        exclusive: true,
        active: modes[0].id,
      })
    : null;

  const params = createRangeGroup({ ranges: paramOpts });

  let loupe: Loupe | null = null;
  let magnifier: ToggleGroup | null = null;

  const toolbarChildren: ToggleGroup[] = [];
  if (modeGroup) toolbarChildren.push(modeGroup);

  const toolbar =
    modeGroup || loupeOpts !== false
      ? createWindow({
          x: toolbarPos.x ?? 52,
          y: toolbarPos.y ?? 56,
          width: 64 + 12 * 2,
          children: toolbarChildren,
        })
      : null;

  const panelWidth = panelPos.width ?? 260;
  const panel = paramOpts.length
    ? createWindow({
        x: panelPos.x ?? width / 2 - panelWidth / 2,
        y: panelPos.y ?? height - 320,
        width: panelWidth,
        children: params.controls,
      })
    : null;

  const ui = createUI();

  // --- Loupe -------------------------------------------------------------------
  let currentScene: DrawScene | null = null;
  const view = (magnified: boolean, magnification: number): SceneView => ({
    magnified,
    magnification,
    mode: modeGroup ? modeGroup.active[0] : null,
    params: params.values(),
  });

  if (loupeOpts !== false) {
    loupe = createLoupe({
      camera,
      size: [width, height],
      radiusFactor: loupeOpts.radiusFactor,
      steps: loupeOpts.steps,
      magnification: loupeOpts.magnification,
      render: (c, lens, info) => {
        drawGridLines(c, lens, { step: gridStep(camera.zoom), subdivisions: grid.subdivisions, area: lens.viewport });
        currentScene?.(c, lens, view(true, info.magnification));
      },
    });
    const theLoupe = loupe;
    magnifier = createToggleGroup({
      items: [{ id: 'zoom', drawIcon: icons.zoom }],
      exclusive: false,
      onChange: (active) => {
        if (active.includes('zoom')) {
          if (!theLoupe.center) theLoupe.placeAt({ x: inner.x + inner.w / 2, y: inner.y + inner.h / 2 });
          else theLoupe.visible = true;
        } else theLoupe.hide();
      },
    });
    toolbarChildren.push(magnifier);
    ui.add(loupe);
  }
  if (toolbar) ui.add(toolbar);
  if (panel) ui.add(panel);

  // --- Input -------------------------------------------------------------------
  // The loupe is repositioned by dragging only — a click on the grid does nothing.
  const disposePointer = attachPointer(canvas, ui, size, { onChange });
  const disposeWheel = loupe ? loupe.attachWheel(canvas, size, onChange) : () => {};

  // After the camera moves, keep a visible loupe inside the grid: `placeAt` re-clamps
  // its screen position, so the lens stays put on screen while the content moves under it.
  const onCameraChange = () => {
    const c = loupe?.visible ? loupe.screenCenter() : null;
    if (c) loupe!.placeAt(c);
    onChange();
  };
  const disposeGestures =
    gestureOpts !== false
      ? attachCameraGestures(canvas, camera, {
          getSize: size,
          shouldHandle: (pt) => contains(inner, pt) && !ui.hitTest(pt),
          onChange: onCameraChange,
          wheelZoomSpeed: gestureOpts.wheelZoomSpeed,
        })
      : () => {};

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'h') {
      toolbar?.show();
      panel?.show();
      onChange();
    }
    if (e.key === 'r' && gestureOpts !== false && camera.reset()) onCameraChange();
    if (e.key === 'Escape' && loupe?.hide()) {
      magnifier?.setActive('zoom', false);
      onChange();
    }
  };
  window.addEventListener('keydown', onKey);

  // --- Hatch patterns ------------------------------------------------------------
  const hatches = new Map<string, CanvasPattern | string>();
  const hatch = (color: string) => {
    const cached = hatches.get(color);
    if (cached) return cached;
    const tile = 6;
    const c = document.createElement('canvas');
    c.width = c.height = tile * pixelRatio;
    const t = c.getContext('2d');
    let out: CanvasPattern | string = color;
    if (t) {
      t.scale(pixelRatio, pixelRatio);
      t.fillStyle = color;
      t.fillRect(0, 0, tile, tile);
      t.fillStyle = 'rgba(17, 17, 17, 0.55)';
      t.beginPath();
      t.arc(tile / 2, tile / 2, 0.9, 0, Math.PI * 2);
      t.fill();
      const pattern = ctx.createPattern(c, 'repeat');
      if (pattern) {
        pattern.setTransform(new DOMMatrix().scale(1 / pixelRatio));
        out = pattern;
      }
    }
    hatches.set(color, out);
    return out;
  };

  // --- Render ------------------------------------------------------------------
  const drawReadout = () => {
    const rows: [string, number][] = params.controls.map((r) => [r.id.toUpperCase(), r.value]);
    if (camera.zoom !== 1) rows.push(['ZOOM', camera.zoom]);
    if (loupe?.visible) rows.push(['LOUPE', loupe.magnification]);
    if (!rows.length) return;
    ctx.save();
    ctx.font = labelFont(13, 500);
    ctx.fillStyle = theme.ink;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    const rx = inner.x + inner.w - 24;
    const ry = inner.y + 28;
    rows.forEach(([k, n], i) => {
      ctx.fillText(`:${n.toFixed(2).padStart(6, '0')}`, rx, ry + i * 18);
      ctx.fillText(k, rx - 64, ry + i * 18);
    });
    ctx.restore();
  };

  const render = (drawScene: DrawScene) => {
    currentScene = drawScene;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    drawGridMarkers(ctx, { ...grid, camera });
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    drawScene(ctx, camera, view(false, 1));
    ctx.restore();
    if (readout) drawReadout();
    ui.draw(ctx);
  };

  return {
    camera,
    inner,
    px,
    params,
    get mode() {
      return modeGroup ? modeGroup.active[0] : null;
    },
    loupe,
    ui,
    windows: { toolbar, panel },
    grid,
    render,
    hatch,
    dispose: () => {
      disposePointer();
      disposeWheel();
      disposeGestures();
      window.removeEventListener('keydown', onKey);
    },
  };
}

import type { SketchProps, SketchSettings } from 'ssam';

// @ts-ignore — canvas-sketch-util is CJS without proper types
import penplot from 'canvas-sketch-util/penplot';

const { pathsToSVG, pathsToPolylines } = penplot;

export interface PenplotOptions {
  context: CanvasRenderingContext2D;
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Physical paper width in `units` */
  physicalWidth: number;
  /** Physical paper height in `units` */
  physicalHeight: number;
  /** Physical units: 'cm', 'mm', 'in', etc. */
  units: string;
  background?: string;
  foreground?: string;
  /** Line width in physical units */
  lineWidth?: number;
  lineJoin?: CanvasLineJoin;
  lineCap?: CanvasLineCap;
  /** Enable path optimization for plotter (sort, merge, dedup) */
  optimize?: boolean | object;
}

/**
 * Renders paths to canvas for preview and generates a physically-sized SVG string.
 *
 * Paths should be drawn in physical units (matching `physicalWidth`/`physicalHeight`).
 * The canvas context is scaled so physical coordinates fill the pixel canvas.
 */
export function renderPenplot(paths: any[], opts: PenplotOptions): string {
  const {
    context,
    width,
    height,
    physicalWidth,
    physicalHeight,
    units,
    background = 'white',
    foreground = 'black',
    lineWidth,
    lineJoin = 'round',
    lineCap = 'round',
    optimize = true,
  } = opts;

  const sx = width / physicalWidth;
  const sy = height / physicalHeight;

  // Canvas preview
  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.scale(sx, sy);

  context.strokeStyle = foreground;
  // Set lineWidth in physical units (after scale transform).
  // Default to a fine pen tip (~0.03cm) if not specified.
  context.lineWidth = lineWidth ?? 0.03;
  context.lineJoin = lineJoin;
  context.lineCap = lineCap;

  // Convert all paths (d3-path objects, SVG strings, polylines) to flat
  // polylines for canvas rendering. This avoids the normalize-svg-path
  // ESM/CJS interop issue that breaks drawSVGPath in Vite.
  const polylines: number[][][] = pathsToPolylines(paths, { units: 'px' });

  for (const polyline of polylines) {
    if (polyline.length === 0) continue;
    context.beginPath();
    context.moveTo(polyline[0][0], polyline[0][1]);
    for (let i = 1; i < polyline.length; i++) {
      context.lineTo(polyline[i][0], polyline[i][1]);
    }
    context.stroke();
  }

  context.restore();

  // Generate physically-sized SVG
  return pathsToSVG(paths, {
    width: physicalWidth,
    height: physicalHeight,
    units,
    lineWidth,
    optimize,
  });
}

function formatDatetime(date: Date): string {
  const offset = date.getTimezoneOffset();
  date.setMinutes(date.getMinutes() - offset);
  const isoString = date.toISOString();
  const match = isoString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return '';
  const [, yyyy, mo, dd, hh, mm, ss] = match;
  return `${yyyy}.${mo}.${dd}-${hh}.${mm}.${ss}`;
}

/**
 * Listens for Cmd+S / Ctrl+S and exports the SVG file alongside
 * ssam's normal PNG export. Returns a cleanup function to remove
 * the listener (call it in `import.meta.hot.dispose`).
 */
export function setupPenplotExport(
  settings: SketchSettings,
  getSvg: () => string | null,
): () => void {
  const handleKeydown = (ev: KeyboardEvent) => {
    if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key === 's') {
      const svg = getSvg();
      if (svg && import.meta.hot) {
        const s = settings as any;
        const prefix = s.prefix ?? '';
        const suffix = s.suffix ?? '';
        const filename = s.filename
          ? `${prefix}${s.filename}${suffix}`.trim()
          : `${prefix}${formatDatetime(new Date())}${suffix}`.trim();

        import.meta.hot.send('ssam:export-svg', { svg, filename });
      }
    }
  };

  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}

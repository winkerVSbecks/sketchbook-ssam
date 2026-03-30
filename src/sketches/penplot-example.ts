import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
// @ts-ignore
import { createPath } from 'canvas-sketch-util/penplot';
import { renderPenplot, setupPenplotExport } from '../penplot/render-penplot';
import { getDimensionsFromPreset } from '../penplot/distances';

const units = 'cm';
const [physicalWidth, physicalHeight] = getDimensionsFromPreset('a4', units);

export const sketch = ({ wrap, context }: SketchProps) => {
  let latestSvg: string | null = null;
  const cleanupExport = setupPenplotExport(settings, () => latestSvg);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanupExport();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    const paths = [];

    const cx = physicalWidth / 2;
    const cy = physicalHeight / 2;
    const maxRadius = Math.min(physicalWidth, physicalHeight) * 0.4;
    const count = 30;

    // Concentric circles
    for (let i = 1; i <= count; i++) {
      const p = createPath();
      const r = (i / count) * maxRadius;
      p.arc(cx, cy, r, 0, Math.PI * 2);
      paths.push(p);
    }

    // Cross-hatch lines through the center
    const lineCount = 12;
    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI;
      const p = createPath();
      p.moveTo(
        cx + Math.cos(angle) * maxRadius,
        cy + Math.sin(angle) * maxRadius
      );
      p.lineTo(
        cx - Math.cos(angle) * maxRadius,
        cy - Math.sin(angle) * maxRadius
      );
      paths.push(p);
    }

    latestSvg = renderPenplot(paths, {
      context,
      width,
      height,
      physicalWidth,
      physicalHeight,
      units,
      optimize: true,
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, Math.round(1080 * (physicalHeight / physicalWidth))],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

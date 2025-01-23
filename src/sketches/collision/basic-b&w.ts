import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Vector } from 'p5';
import {
  calculateMtv,
  checkScreenBounds,
  drawPolygon,
  movePolygon,
  polygon,
  Polygon,
  resolveCollision,
  updatePolygon,
} from './SAT';

export const sketch = async ({ wrap, width, height, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const polygons: Polygon[] = [];
  for (let index = 0; index < 24; index++) {
    const location = new Vector(
      Random.range(0, width),
      Random.range(0, height)
    );

    const p = polygon(
      location,
      100,
      Random.rangeFloor(3, 8),
      new Vector(width / 2, height / 2).sub(location).normalize().mult(2)
    );

    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    while (attempts < MAX_ATTEMPTS) {
      let hasOverlap = false;
      checkScreenBounds(p, width, height);

      // Check against existing polygons
      for (const existingPoly of polygons) {
        const translationVector = calculateMtv(existingPoly, p);
        if (translationVector) {
          hasOverlap = true;
          movePolygon(p, translationVector);
        }
      }

      if (!hasOverlap) {
        polygons.push(p);
        break;
      }

      attempts++;
    }
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    polygons.forEach((p) => {
      updatePolygon(p);
    });

    polygons.forEach((p, i) => {
      checkScreenBounds(p, width, height);

      for (let j = i + 1; j < polygons.length; j++) {
        const poly2 = polygons[j];
        resolveCollision(p, poly2);
      }
    });

    polygons.forEach((p) => {
      drawPolygon(context, p);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

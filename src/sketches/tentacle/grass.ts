import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../../colors/subtractive-hue';
import { lerp, mapRange } from 'canvas-sketch-util/math';
import getNormals from 'polyline-normals';
import { drawPath } from '@daeinc/draw';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

let config = {
  count: 12 * 6,
  spread: 30, //80,
  yRange: [0.7, 0.9], //[0.2, 0.4],
};

function wobbly(a: number, b: number, x: number, t: number) {
  return Math.sin(a * x + b * t + 5) + Math.sin(b * x + a * t + 4);
}

interface Tentacle {
  points: Line;
  color: string;
  accent: string;
  side: 'left' | 'right';
  a: number;
  b: number;
}

export const sketch = ({
  wrap,
  context,
  width,
  height,
  canvas,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColors('srgb', 145);
  const bg = colors.pop()!;
  const tentacles: Tentacle[] = Array.from({ length: config.count }).map(() => {
    const points = generateSkeleton(width, height);
    const a = Random.pick([2, 3, 4]);

    return {
      points,
      color: Random.pick(colors),
      accent: Random.pick(colors),
      side: Random.pick(['left', 'right']),
      a: a, //Random.rangeFloor(0, 4);
      b: a, //6 - a;
    };
  });

  function tentacleShape(
    tentacle: Tentacle,
    playhead: number,
    off: number
  ): Point[] {
    const delta = width * 0.1;
    const points = tentacle.points.map(([x, y]) => [
      x +
        delta *
          wobbly(tentacle.a, tentacle.b, (off + y) / height, playhead) *
          mapRange(y, 0.2 * height, height, 1, 0, true),
      y,
    ]);
    const normals = getNormals(points);
    const shapeA: Point[] = [];
    const shapeB: Point[] = [];

    for (let idx = 0; idx < points.length; idx++) {
      const normal = normals[idx][0];
      const point = points[idx];

      const spread = mapRange(idx, 0, points.length - 1, 0, config.spread);
      shapeA.push([
        point[0] + normal[0] * spread,
        point[1] + normal[1] * spread,
      ]);
      shapeB.push([
        point[0] - normal[0] * spread,
        point[1] - normal[1] * spread,
      ]);
    }

    const shape = [...shapeA, ...shapeB.reverse()];

    return shape;
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 20;
    context.lineJoin = 'round';

    tentacles.forEach((tentacle, idx) => {
      const { points, color, accent, side } = tentacle;
      const shape = tentacleShape(
        tentacle,
        playhead * Math.PI * 2 + (Math.PI / 2) * idx,
        idx
      );

      const shift = side === 'left' ? -20 : 20;
      const ys = shape.map((v) => v[1]);
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);

      const shiftedShape = shape.map(([x, y]) => [
        x + mapRange(y, yMin, yMax, 0, shift, true),
        y,
      ]);

      context.save();
      context.shadowColor = 'rgba(0,0,0,0.1)';
      context.shadowOffsetX = -shift;
      context.shadowOffsetY = -shift;

      context.fillStyle = accent;
      context.strokeStyle = accent;
      context.beginPath();
      drawPath(context, shiftedShape);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();

      context.fillStyle = color;
      context.strokeStyle = color;
      context.beginPath();
      drawPath(context, shape);
      context.closePath();
      context.fill();
      context.stroke();
    });

    // const ditheredImage = scaleCanvasAndApplyDither(
    //   width,
    //   height,
    //   0.5,
    //   canvas,
    //   (data) =>
    //     dither(data, {
    //       greyscaleMethod: 'none',
    //       ditherMethod: 'atkinson',
    //     })
    // );
    // context.drawImage(ditheredImage, 0, 0, width, height);
  };
};

function generateSkeleton(
  width: number,
  height: number,
  steps: number = 20
): Line {
  const x = Random.range(0, width);
  const yMin = Random.range(
    config.yRange[0] * height,
    config.yRange[1] * height
  );

  const tentacle: Line = Array.from({ length: steps }, (_, idx) => {
    return [x, lerp(yMin, 1.1 * height, idx / (steps - 1))];
  });

  return tentacle;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { drawCircle } from '@daeinc/draw';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColors();
  const bg = colors.shift()!;

  const maxCount = 5000; // max count of the cirlces
  let currentCount = 1;
  const x: number[] = [];
  const y: number[] = [];
  const r: number[] = [];

  // first circle
  x[0] = width / 2;
  y[0] = height / 2;
  r[0] = 10;

  wrap.render = ({}: SketchProps) => {
    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    if (currentCount < maxCount) {
      // create a random set of parameters
      const newR = Random.range(1, 7);
      const newX = Random.range(newR, width - newR);
      const newY = Random.range(newR, height - newR);

      let closestDist = Number.MAX_VALUE;
      let closestIndex = 0;
      // which circle is the closest?
      for (let i = 0; i < currentCount; i++) {
        const newDist = Math.hypot(newX - x[i], newY - y[i]);
        if (newDist < closestDist) {
          closestDist = newDist;
          closestIndex = i;
        }
      }

      // show original position of the circle and a line to the new position
      // fill(230);
      // ellipse(newX, newY, newR * 2, newR * 2);
      // line(newX, newY, x[closestIndex], y[closestIndex]);

      // aline it to the closest circle outline
      var angle = Math.atan2(newY - y[closestIndex], newX - x[closestIndex]);

      x[currentCount] =
        x[closestIndex] + Math.cos(angle) * (r[closestIndex] + newR);
      y[currentCount] =
        y[closestIndex] + Math.sin(angle) * (r[closestIndex] + newR);
      r[currentCount] = newR;
      currentCount++;
    }

    // draw them
    for (var i = 0; i < currentCount; i++) {
      context.fillStyle = colors[i % colors.length];
      context.beginPath();
      drawCircle(context, [x[i], y[i]], r[i] * 2);
      context.fill();
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

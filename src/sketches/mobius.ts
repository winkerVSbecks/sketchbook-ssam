import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

const config = {
  angleInc: 2,
  angleMotionSpeed: 0.2,
  w: 160 / 2,
  h: 50 / 2,
};

const colors = generateColors();
const bg = colors.shift()!;

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let angle = 0;
  let angleStart = 0;
  let canDraw = true;

  let mode = true;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    canDraw = true;
    angle = angleStart;
    mode = true;

    while (canDraw == true) {
      const w =
        config.w +
        Math.sin(radians(angle) + Math.PI * 2 * playhead) * config.w * 0.5;
      const h =
        config.h +
        Math.sin(radians(angle) + Math.PI * 2 * playhead) * config.h * 0.5;
      const r = 240 + Math.sin(2 * Math.PI * playhead) * 10;

      let x = Math.cos(radians(angle)) * r + width / 2;
      let y = Math.sin(radians(angle)) * r + height / 2;

      let rotation = -radians(angle) * 0.5;

      if (mode) {
        context.fillStyle = colors[0];
      } else {
        context.fillStyle = colors.at(-1)!;
      }

      if (angle <= 360) {
        context.save();

        context.beginPath();
        context.rect(0, 0, width / 2, height);
        context.clip();

        context.translate(x, y);
        context.rotate(rotation);
        context.beginPath();
        context.ellipse(0, 0, w, h, 0, 0, 2 * Math.PI);
        context.fill();
        context.restore();
      }

      if (angle <= 540) {
        context.save();

        context.beginPath();
        context.rect(width / 2, 0, width / 2, height);
        context.clip();

        context.translate(x, y);
        context.rotate(rotation);
        context.beginPath();
        context.ellipse(0, 0, w, h, 0, 0, 2 * Math.PI);
        context.fill();
        context.restore();
      }

      angle += config.angleInc;
      mode = !mode;

      if (angle > 540) canDraw = false;
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

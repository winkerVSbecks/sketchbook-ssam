import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { drawCircle, drawLine, drawPath } from '@daeinc/draw';
import { lerpArray } from 'canvas-sketch-util/math';
import { scaleCanvasAndApplyDither } from '../scale-canvas-dither';
import { dither } from '../dither';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

let colors: string[],
  bg: string,
  frameFront: string,
  frameInner: string,
  frameOuter: string,
  grill: string,
  diamond: string,
  circle: string;

function movePointByAngle(
  [x, y]: number[],
  angle: number,
  r: number
): [number, number] {
  return [x + Math.cos(angle) * r, y + Math.sin(angle) * r];
}

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height, canvas }: SketchProps) => {
    colors = generateColors();
    bg = colors.shift()!;
    frameFront = colors.pop()!;
    frameInner = colors.pop()!;
    frameOuter = colors.pop()!;
    grill = colors.pop()!;
    diamond = colors.shift()!;
    circle = colors.shift()!;

    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    const w = width / 2;
    const h = (4 * w) / 3;
    const t = 0.1 * w;
    const t2 = t / 2;
    const t45 = Math.cos(Math.PI / 4) * t * 0.3;

    context.save();
    context.translate(width / 2, height / 2);
    drawThickHorizontalLine(
      context,
      [-w / 2 - t / 2, h / 2],
      [w / 2, h / 2],
      t
    );
    drawThickVerticalLine(
      context,
      [-w / 2 - t / 2, -h / 2],
      [-w / 2 - t / 2, h / 2 - t],
      t
    );
    drawThickVerticalLine(context, [w / 2, -h / 2], [w / 2, h / 2], t);
    drawThickHorizontalLine(
      context,
      [-w / 2 - t / 2, -h / 2],
      [w / 2, -h / 2],
      t
    );

    const s = w / 6;
    const diagS = Math.sqrt(2) * s;

    context.strokeStyle = grill;
    context.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      const x = i * s;
      context.beginPath();
      drawLine(context, [x, -h / 2 + t2], [x, h / 2 - t2 - t45]);
      context.stroke();
    }

    for (let j = 0; j <= 6; j++) {
      const y = -h / 2 + t2 + s / 2 + j * s;
      context.save();
      context.beginPath();
      drawLine(context, [-w / 2 + t2 - t45, y], [w / 2 - t2, y]);
      context.stroke();
      context.restore();

      for (let i = -2; i <= 2; i++) {
        const x = i * s;

        const style = (j % 2 === 0 ? i % 2 === 0 : i % 2 !== 0) ? 'a' : 'b';

        if (i < 2 && j < 6) {
          if (style === 'a') {
            context.save();
            context.beginPath();
            drawPath(context, [
              [x, y],
              lerpArray([x + s, y], [x, y + s], 0.6),
              [x + s, y + s],
              lerpArray([x + s, y], [x, y + s], 0.4),
              [x, y],
            ]);
            context.stroke();
            context.restore();
          } else {
            context.save();
            context.beginPath();
            drawPath(context, [
              [x + s, y],
              lerpArray([x, y], [x + s, y + s], 0.6),
              [x, y + s],
              lerpArray([x, y], [x + s, y + s], 0.4),
              [x + s, y],
            ]);
            context.stroke();
            context.restore();
          }
        }

        if (j % 2 === 0 ? i % 2 === 0 : i % 2 !== 0) {
          context.save();
          context.fillStyle = circle;
          context.beginPath();
          drawCircle(context, [x, y], 30);
          context.fill();
          context.restore();
        } else {
          context.save();
          context.fillStyle = diamond;
          context.beginPath();
          drawDiamond(context, [x, y], 35);
          context.fill();
          context.restore();
        }
      }
    }

    context.restore();

    const ditheredImage = scaleCanvasAndApplyDither(
      width,
      height,
      0.35,
      canvas,
      (data) =>
        dither(data, {
          greyscaleMethod: 'none',
          ditherMethod: 'atkinson',
        })
    );

    context.drawImage(ditheredImage, 0, 0, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 12_000,
  playFps: 1.5,
  exportFps: 1.5,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

function drawDiamond(
  context: CanvasRenderingContext2D,
  [x, y]: number[],
  side: number
) {
  const s = side / 2;
  context.beginPath();
  context.moveTo(x, y - s);
  context.lineTo(x + s, y);
  context.lineTo(x, y + s);
  context.lineTo(x - s, y);
  context.closePath();
  context.fill();
}

function drawThickHorizontalLine(
  context: CanvasRenderingContext2D,
  [x1, y1]: number[],
  [x2, y2]: number[],
  t: number
) {
  const t2 = t / 2;

  context.fillStyle = frameFront;
  context.beginPath();
  context.moveTo(x1 - t2, y1 - t / 2);
  context.lineTo(x1 - t2, y1 + t / 2);
  context.lineTo(x2 + t2, y2 + t / 2);
  context.lineTo(x2 + t2, y2 - t / 2);
  context.closePath();
  context.fill();

  const t45 = Math.cos(Math.PI / 4) * t;
  context.fillStyle = frameOuter;
  context.beginPath();
  context.moveTo(x1 - t2, y1 - t2);
  context.lineTo(...movePointByAngle([x1 - t2, y1 - t2], -Math.PI / 4, t45));
  context.lineTo(...movePointByAngle([x2 + t2, y2 - t2], -Math.PI / 4, t45));
  context.lineTo(x2 + t2, y2 - t2);
  context.closePath();
  context.fill();
}

function drawThickVerticalLine(
  context: CanvasRenderingContext2D,
  [x1, y1]: number[],
  [x2, y2]: number[],
  t: number
) {
  const t2 = t / 2;

  context.fillStyle = frameFront;
  context.beginPath();
  context.moveTo(x1 - t2, y1 - t2);
  context.lineTo(x1 + t2, y1 - t2);
  context.lineTo(x2 + t2, y2 + t2);
  context.lineTo(x2 - t2, y2 + t2);
  context.closePath();
  context.fill();

  const t45 = Math.cos(Math.PI / 4) * t;
  context.fillStyle = frameInner;
  context.beginPath();
  context.moveTo(x1 + t2, y1 - t2);
  context.lineTo(...movePointByAngle([x1 + t2, y1 - t2], -Math.PI / 4, t45));
  context.lineTo(...movePointByAngle([x2 + t2, y2 + t2], -Math.PI / 4, t45));
  context.lineTo(x2 + t2, y2 + t2);
  context.closePath();
  context.fill();
}

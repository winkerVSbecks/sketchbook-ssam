import WebFont from 'webfontloader';
import Random from 'canvas-sketch-util/random';
import { ssam } from 'ssam';
import Color from 'canvas-sketch-util/color';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import { drawCircle } from '@daeinc/draw';
import { formatHex } from 'culori';

const config = {
  resolution: 4,
};

const colors = generateColors(6);
const bg = colors.shift()!;
const text = colors.pop()!;

function getTileColors() {
  const c1 = Random.pick(colors);
  const c2 = Random.pick(colors.filter((c) => Color.contrastRatio(c, c1) > 2));
  const c3 = Random.pick(colors.filter((c) => Color.contrastRatio(c, c2) > 2));

  return [c1, c2, c3];
}

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  await new Promise((resolve) => {
    WebFont.load({
      google: {
        families: ['Staatliches'],
      },
      active: () => {
        resolve(void 0);
      },
    });
  });

  function drawTile(
    context: CanvasRenderingContext2D,
    [x, y]: number[],
    size: number,
    [c1, c2, c3]: string[],
    corner: number[]
  ) {
    context.fillStyle = c1;
    context.fillRect(x, y, size, size);

    context.save();
    context.beginPath();
    context.rect(x, y, size, size);
    context.clip();

    context.fillStyle = c2;
    context.beginPath();
    drawCircle(context, corner, size * 2);
    context.fill();

    context.fillStyle = c3;
    const r = size * 2 * 0.25;
    context.beginPath();
    drawCircle(context, corner, r * 2);
    context.fill();
    context.restore();
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const margin = 0.05 * width;
    const s = (width - 2 * margin) / config.resolution;

    for (let j = 0; j < config.resolution + 1; j++) {
      for (let i = 0; i < config.resolution; i++) {
        const x = margin + i * s;
        const y = margin + j * s;

        const cornersBottom = [
          [x, y],
          [x + s, y],
        ];
        const cornersTop = [
          [x, y + s],
          [x + s, y + s],
        ];

        const [c1, c2, c3] = getTileColors();
        drawTile(
          context,
          [x, y],
          s,
          [c1, c2, c3],
          (j % 2 === 0 ? cornersBottom : cornersTop)[i % 2]
        );
      }
    }

    context.font = `${s * 0.25}px Staatliches`;
    context.fillStyle = text;
    context.fillText('bauhaus weimar 1923', margin, height - margin);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [27 * 40, 40 * 40],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 4_000,
  playFps: 3,
  exportFps: 3,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch, settings);

function generateColors(count: number) {
  const colors = generateColorRamp({
    total: count,
  })
    .reverse()
    .map((color) => formatHex(colorToCSS(color, 'hsl')));

  return colors;
}

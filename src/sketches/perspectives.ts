import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
// import { generateColors } from '../subtractive-color';
import { drawPath } from '@daeinc/draw';
import { generateColorRamp, colorToCSS } from 'rampensau';

let config = {
  resolution: 36,
};

function generateColors() {
  const hStart = Random.rangeFloor(0, 360);

  const colors = generateColorRamp({
    total: 7,
    hStart,
    hEasing: (x) => x,
    hCycles: 0,
    sRange: [0.2, 0.8],
    lRange: [0.2, 0.8],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'hsl'));

  return colors;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColors();
  const bg = colors.pop()!;
  const lines = colors.pop()!;

  const vanishingPoint = [width / 2, height / 2];

  const depths = [
    Random.rangeFloor(width * 0.3, width * 0.4),
    Random.rangeFloor(width * 0.2, width * 0.3),
  ];
  const angles = Array.from({ length: 5 })
    .map(
      () =>
        (Random.rangeFloor(0, config.resolution) / config.resolution) *
        Math.PI *
        2
    )
    .sort((a, b) => a - b);

  const outer = angles.map((angle) => [
    width / 2 + depths[0] * Math.cos(angle),
    height / 2 + depths[0] * Math.sin(angle),
  ]);

  const inner = angles.map((angle) => [
    width / 2 + depths[1] * Math.cos(angle),
    height / 2 + depths[1] * Math.sin(angle),
  ]);

  const panels: any[] = [];
  for (let index = 0; index < inner.length; index++) {
    const prev = index === 0 ? inner.length - 1 : index - 1;

    const a = outer[prev];
    const b = inner[prev];
    const c = inner[index];
    const d = outer[index];

    panels.push({
      points: [a, b, c, d],
      color: Random.pick(colors),
    });
  }

  panels.push({
    points: inner,
    color: Random.pick(colors),
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = lines;
    for (let index = 0; index < config.resolution; index++) {
      const angle = (index / config.resolution) * Math.PI * 2;
      context.beginPath();
      context.moveTo(vanishingPoint[0], vanishingPoint[1]);
      context.lineTo(
        vanishingPoint[0] + Math.cos(angle) * width,
        vanishingPoint[1] + Math.sin(angle) * width
      );
      context.stroke();
    }

    panels.forEach(({ points, color }) => {
      context.fillStyle = color;
      context.beginPath();
      drawPath(context, points, true);
      context.fill();
    });

    context.beginPath();
    drawPath(context, inner, true);
    context.stroke();
    context.beginPath();
    drawPath(context, outer, true);
    context.stroke();
  };
};

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

import { mapRange } from 'canvas-sketch-util/math';
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

const config = {
  resolution: 32,
  margin: 0.1,
};

const colors = [
  '#DC8C59',
  '#387F88',
  '#334A36',
  '#E6C9C6',
  '#476496',
  '#8A725E',
  '#50A0CE',
  '#537E79',
  '#E67182',
];

function wobbly(x: number, y: number, t: number) {
  const rx = 0.707 * x + 0.707 * y;
  const ry = 0.707 * y - 0.707 * x;
  return (
    Math.sin(
      2.31 * x + 0.11 * t + 5.95 + 2.57 * Math.sin(1.73 * y - 0.65 * t + 1.87)
    ) +
    Math.sin(
      3.09 * ry - 0.28 * t + 4.15 + 2.31 * Math.sin(2.53 * rx + 0.66 * t + 4.45)
    ) +
    Math.sin(
      3.06 * x - 0.18 * t + 5.16 + 2.28 * Math.sin(2.27 * y + 0.71 * t + 3.97)
    ) +
    Math.sin(
      5.4 * y - 0.13 * t + 4.74 + 2.83 * Math.sin(3.71 * x + 0.96 * t + 4.42)
    ) /
      2
  );
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const margin = width * config.margin;
  const w = (width - 2 * margin) / config.resolution;
  const h = (height - 2 * margin) / config.resolution;
  const r = w * 0.0625;

  const bg = '#E8E8E8';
  const border = '#6A5D5B';
  const TAU = Math.PI * 2;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // draw grid
    context.strokeStyle = border;
    context.lineWidth = 1;
    context.beginPath();
    for (let i = 0; i < config.resolution; i++) {
      const x = margin + i * w;
      context.moveTo(x, margin);
      context.lineTo(x, height - margin - w);
    }
    for (let j = 0; j < config.resolution; j++) {
      const y = margin + j * h;
      context.moveTo(margin, y);
      context.lineTo(width - margin - h, y);
    }
    context.stroke();

    for (let i = 0; i < config.resolution; i++) {
      for (let j = 0; j < config.resolution; j++) {
        const x = margin + i * w;
        const y = margin + j * h;

        const radius = mapRange(
          wobbly(i * TAU, j * TAU, playhead * TAU * 2),
          -3.5,
          3.5,
          0,
          w * 0.5,
          true
        );

        context.fillStyle = colors[(i + j) % colors.length];
        context.strokeStyle = border;
        context.lineWidth = 2;

        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
        context.stroke();
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

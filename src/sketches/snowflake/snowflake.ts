import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColorSystem } from '../../colors/subtractive-shift';

const colorSystem = generateColorSystem('srgb');

const config = {
  scaleFactor: Number(Random.range(1, 5).toFixed(1)), // 1,
  mode: Random.pick(['dots', 'split']) as 'dots' | 'split',
  shiftScale: Random.boolean(),
};

const sketch = ({ context, wrap }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const num = 40;
  const margin = 30;

  wrap.render = ({ width, height, frame }: SketchProps) => {
    const size = (width - margin * 2) / num;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    if (config.shiftScale) {
      if (frame === 0) {
        config.scaleFactor = 1;
      }
      config.scaleFactor += 0.00001;
    }

    const colors = colorSystem();

    for (let i = 0; i < num; i++) {
      for (let j = 0; j < num; j++) {
        const x = margin + size / 2 + i * size;
        const y = margin + size / 2 + j * size;

        const dist = Math.hypot(x - width / 2, y - height / 2);
        // change style based on distance from center for each concentric square
        const style = Math.floor(dist) % 2 === 0;

        const distFromCenter = Math.hypot(x - width / 2, y - height / 2);
        const scaledDist = Math.pow(distFromCenter, config.scaleFactor);
        const colorIndex = Math.floor(scaledDist) % colors.length;

        const s = size * 0.25;

        if (config.mode === 'split') {
          if (style) {
            // draw X's
            context.strokeStyle = colors[colorIndex];
            context.lineWidth = 4;
            context.beginPath();
            context.moveTo(x - s, y - s);
            context.lineTo(x + s, y + s);
            context.moveTo(x + s, y - s);
            context.lineTo(x - s, y + s);
            context.stroke();
          } else {
            context.fillStyle = colors[colorIndex];
            context.beginPath();
            context.arc(x, y, s / 2, 0, Math.PI * 2);
            context.fill();
          }
        } else {
          context.fillStyle = colors[colorIndex];
          context.strokeStyle = '#000';
          context.lineWidth = 4;
          context.beginPath();
          context.arc(x, y, size / 2, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

const config = {
  scaleFactor: 1,
};

const sketch = ({ context, wrap }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const num = 40;
  const margin = 30;
  const snowPallete = [
    '#FFFFFF',
    '#CCE7FF',
    '#99D0FF',
    '#66B8FF',
    '#339FFF',
    '#0077FF',
    '#0055AA',
    '#003377',
  ];

  wrap.render = ({ width, height }: SketchProps) => {
    const size = (width - margin * 2) / num;
    context.fillStyle = 'rgb(0, 0, 80)';
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < num; i++) {
      for (let j = 0; j < num; j++) {
        const x = margin + size / 2 + i * size;
        const y = margin + size / 2 + j * size;

        const distFromCenter = Math.hypot(x - width / 2, y - height / 2);
        const scaledDist = Math.pow(distFromCenter, config.scaleFactor);
        const colorIndex = Math.floor(scaledDist) % snowPallete.length;

        context.fillStyle = snowPallete[colorIndex];
        context.beginPath();
        context.arc(x, y, size / 2, 0, Math.PI * 2);
        context.fill();
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

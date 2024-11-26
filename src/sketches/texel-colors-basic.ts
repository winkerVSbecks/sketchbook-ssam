import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { ColorSpace, getPalette, System } from '../colors/texel';

const config = {
  system: 0 as System,
  colorSpace: 'display-p3' as ColorSpace,
  serialize: true,
};

const spaces: ColorSpace[] = [
  'xyz',
  'oklab',
  'oklch',
  'srgb',
  'display-p3',
  'a98-rgb',
  'rec2020',
];

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.clearRect(0, 0, width, height);

    const padding = 20;

    const availableWidth = width - (spaces.length + 1) * padding;
    const stripWidth = availableWidth / spaces.length;

    spaces.forEach((colorSpace, sIdx) => {
      const colors = getPalette({ ...config, colorSpace });
      const bg = colors.shift()!;

      const availableHeight = height - (colors.length + 1) * padding;
      const stripHeight = availableHeight / colors.length;

      const x = sIdx * (stripWidth + padding);

      context.fillStyle = bg;
      context.fillRect(x, 0, availableWidth, height);

      colors.forEach((color, idx) => {
        const y = padding + idx * (stripHeight + padding);
        context.fillStyle = color;

        context.fillRect(padding + x, y, stripWidth, stripHeight);
      });
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

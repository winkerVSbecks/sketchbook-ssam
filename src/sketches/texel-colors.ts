import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
// import { ColorSpace, getPalette, System } from '../colors/texel';
import { ColorSpace, getPalette, System } from '../colors/texel-random';

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

const colors = getPalette({ ...config, colorSpace: 'display-p3' });
const bg = colors.shift()!;

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const padding = 20;

    const availableHeight = height - (colors.length + 1) * padding;
    const stripHeight = availableHeight / colors.length;

    colors.forEach((color, idx) => {
      const y = padding + idx * (stripHeight + padding);
      context.fillStyle = color;

      context.fillRect(padding, y, width - padding * 2, stripHeight);
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

import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange, lerpFrames, wrap } from 'canvas-sketch-util/math';
import { rybHsl2rgb } from 'rybitten';
import { cubes, ColorCoords } from 'rybitten/cubes';

const gamuts = [
  'itten',
  'itten-normalized',
  'itten-neutral',
  'bezold',
  'boutet',
  'hett',
  'schiffermueller',
  'harris',
  'harrisc82',
  'harrisc82alt',
  'goethe',
  'munsell',
  'munsell-alt',
  'hayter',
  'bormann',
  'albers',
  'lohse',
  'chevreul',
  'runge',
  'maycock',
  'colorprinter',
  'japschool',
  'kindergarten1890',
  'marvel-news',
  'apple90s',
  'apple80s',
  'clayton',
  'pixelart',
  'ippsketch',
  'ryan',
  'ten',
  'rgb',
];
const gamut = cubes.get(Random.pick(gamuts))!;
// const gamut = cubes.get('itten-normalized')!;
console.log(gamut.title);

const formatCSS = (rgb: ColorCoords): string => {
  return `rgb(${Math.round(rgb[0] * 255)} ${Math.round(
    rgb[1] * 255
  )} ${Math.round(rgb[2] * 255)})`;
};

const getColorHSLFn = (h: number, s = 1, l = 0.5) => {
  return formatCSS(rybHsl2rgb([h, s, l], { cube: gamut.cube }));
};
let h = Random.range(0, 360);
const s = Random.range(0.25, 0.75);
const l = Random.range(0.5, 0.75);

// Configuration
const config = {
  res: 40,
  colorCount: 12,
};

const palette: ColorCoords[] = Array.from(
  { length: config.colorCount },
  (_, idx) => [h + 72 * idx, s, l]
);

const colorOptions = palette
  .map((c) => ({ value: c, weight: 50 }))
  .concat([
    {
      value: [h, s, 0.1],
      weight: 200,
    },
  ]);

const getRandomColor = () => {
  return Random.weightedSet(colorOptions);
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  const grid: { position: Point; color: string }[] = [];
  const w = width / config.res;
  const h = height / config.res;

  for (let x = 0; x < config.res; x++) {
    for (let y = 0; y < config.res; y++) {
      const px = x * w;
      const py = y * h;

      const color = getRandomColor();

      grid.push({
        position: [px, py],
        color: getColorHSLFn(color[0], color[1], color[2]),
      });
    }
  }

  wrap.render = ({ playhead }) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    grid.forEach(({ position: [x, y], color }) => {
      context.fillStyle = color;
      context.fillRect(x, y, w, h);
    });
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

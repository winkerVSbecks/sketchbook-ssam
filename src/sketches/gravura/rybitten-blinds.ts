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

const palette: ColorCoords[] = [
  [h, s, l],
  [h + 72, s, l],
  [h + 144, s, l],
  [h + 216, s, l],
  [h + 288, s, l],
  // [h + 90, s, l],
  // [h + 180, s, l],
  // [h + 270, s, l],
];

// Configuration
const config = {
  columns: 5,
  colors: {
    // bg: l < 0.6 ? getColorHSLFn(h, s, 1) : getColorHSLFn(h, s, 0.1), //palette.pop()!,
    bg: getColorHSLFn(h, s, 0.9),
    fg: palette,
  },
};

type ColumnType = 'filled' | 'hole';

const columnTypes: Record<ColumnType, string[]> = {
  // prettier-ignore
  filled: ['0','1','0','1','0','1','1','1','1','1','0','1','0','1','0','1','1','1','1','1','0','1','0','1','0'],
  // prettier-ignore
  hole: ['1','0','1','0','1','0','0','0','0','0','1','0','1','0','1','0','0','0','0','0','1','0','1','0', '1'],
};

function drawColumn(
  type: ColumnType,
  context: CanvasRenderingContext2D,
  x: number,
  width: number,
  h: number,
  color: ColorCoords,
  t: number,
  offset: number = 0
) {
  // Clip to column area
  context.save();

  context.beginPath();
  context.rect(x, 0, width, h);
  context.clip();

  const fills: Array<{ start: number; count: number }> = [];
  let currentFill: { start: number; count: number } | null = null;

  columnTypes[type].forEach((val, index) => {
    if (val === '1') {
      if (currentFill) {
        currentFill.count++;
      } else {
        currentFill = { start: index, count: 1 };
      }
    } else {
      if (currentFill) {
        fills.push(currentFill);
        currentFill = null;
      }
    }
  });

  const cellHeight = h / (columnTypes[type].length - 1);

  const offT = wrap(t + offset, 0, 1);

  fills.forEach(({ start, count }, idx) => {
    const y = start * cellHeight;
    const height = count * cellHeight;

    const yOff1 = lerpFrames([0, 0, height], offT);
    const hOff1 = lerpFrames([-height, 0, -height], offT);
    context.fillStyle = getColorHSLFn(
      color[0],
      color[1],
      mapRange(idx, 0, fills.length, 0.7, 0.3) + 0.1
    );
    context.fillRect(x, y + yOff1, width, height + hOff1);

    const yOff2 = lerpFrames([0, height, height], offT);
    const hOff2 = lerpFrames([0, -height, -height], offT);
    context.fillStyle = getColorHSLFn(
      color[0],
      color[1],
      mapRange(idx, 0, fills.length, 0.7, 0.3)
    );
    context.fillRect(x, y + yOff2, width, height + hOff2);

    const hOff3 = lerpFrames([0, 0, height], offT);
    context.fillStyle = getColorHSLFn(
      color[0],
      color[1],
      mapRange(idx, 0, fills.length, 0.7, 0.3)
    );
    context.fillRect(x, y, width, hOff3);
  });
  context.restore();
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  const columnWidth = width / config.columns;

  wrap.render = ({ playhead }) => {
    context.fillStyle = config.colors.bg;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < config.columns; i++) {
      const x = i * columnWidth;
      const type: ColumnType = i % 2 === 0 ? 'filled' : 'hole';

      drawColumn(
        type,
        context,
        x,
        columnWidth,
        height,
        config.colors.fg[i],
        playhead,
        i / (config.columns - 1)
      );
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

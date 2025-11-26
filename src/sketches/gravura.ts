import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

// Blues:

// Deep/saturated blue: #2E68C8 (approximately)
// Medium blue: #6B9FDB (approximately)
// Light blue/periwinkle: #98B8DC (approximately)

// Neutrals:

// Off-white/cream: #E8E5DC (approximately)
// Warm gray background: #D4CFC5 (approximately)

// Configuration
const config = {
  columns: 5,
  colors: {
    bg: 'color(display-p3 0.9084 0.9022 0.8808)', // '#e8e6e0',
    fg: 'color(display-p3 0.7465 0.0031 0.0895)', //'#b8312f',
  },
};

// 5 columns
// 2 x 2 x 1
// Fill pattern for 2x columns:
// triangle with top vertex in center two columns, base spanning random width at bottom
//

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
  color: string,
  rotation: number = 0
) {
  // Clip to column area
  context.save();

  context.beginPath();
  context.rect(x, 0, width, h);
  context.clip();

  context.translate(x + width / 2, h / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.translate(-(x + width / 2), -(h / 2));
  columnTypes[type].forEach((val, index) => {
    const y = index * (h / columnTypes[type].length);
    const height = h / columnTypes[type].length;

    if (val === '1') {
      context.fillStyle = color;
      context.fillRect(x, y, width, height);
    }
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

  wrap.render = () => {
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
        config.colors.fg,
        i === config.columns - 1 ? 0 : Random.rangeFloor(-20, 20)
      );
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 2,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

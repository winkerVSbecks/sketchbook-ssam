import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

const palette = ColorPaletteGenerator.generate(
  { l: Random.range(0, 1), c: Random.range(0, 0.4), h: Random.range(0, 360) },
  Random.pick([
    'analogous',
    'complementary',
    'triadic',
    'tetradic',
    'splitComplementary',
    'tintsShades',
  ]),
  {
    style: Random.pick(['default', 'square', 'triangle', 'circle', 'diamond']),
    modifiers: {
      sine: Random.range(-1, 1),
      wave: Random.range(-1, 1),
      zap: Random.range(-1, 1),
      block: Random.range(-1, 1),
    },
  }
).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

logColors(palette);

// Configuration
const config = {
  columns: 5,
  colors: {
    bg: palette.pop()!,
    fg: palette,
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
  rotation: number = 0,
  fill: CanvasGradient
) {
  // Clip to column area
  context.save();

  context.beginPath();
  context.rect(x, 0, width, h);
  context.clip();

  context.fillStyle = fill;
  context.rect(x, 0, width, h);
  context.fill();

  // context.translate(x + width / 2, h / 2);
  // context.rotate(rotation);
  // context.translate(-(x + width / 2), -(h / 2));
  // const fills: Array<{ start: number; count: number }> = [];
  // let currentFill: { start: number; count: number } | null = null;

  // columnTypes[type].forEach((val, index) => {
  //   if (val === '1') {
  //     if (currentFill) {
  //       currentFill.count++;
  //     } else {
  //       currentFill = { start: index, count: 1 };
  //     }
  //   } else {
  //     if (currentFill) {
  //       fills.push(currentFill);
  //       currentFill = null;
  //     }
  //   }
  // });

  // const cellHeight = h / columnTypes[type].length;
  // fills.forEach(({ start, count }, idx) => {
  //   context.fillStyle = config.colors.fg[idx % config.colors.fg.length];
  //   const y = start * cellHeight;
  //   const height = count * cellHeight;
  //   context.fillRect(x, y, width, height);
  // });
  context.restore();
}

function computeTriangle(
  [x1, y1]: Point,
  [x2min, x2max]: [number, number],
  y2: number
): Point[] {
  const vertices: Point[] = [[x1, y1]];
  const x2 = Random.rangeFloor(x2min, x1);
  vertices.push([x2, y2]);
  const x3 = Random.rangeFloor(x1, x2max);
  vertices.push([x3, y2]);

  return vertices;
}

function computeAngles([p1, p2, p3]: Point[]): number[] {
  const deltaX1 = p1[0] - p2[0];
  const deltaX2 = p3[0] - p1[0];
  const deltaY = p1[1] - p2[1];

  return [
    Math.PI / 2 + Math.atan2(deltaY, deltaX1),
    Math.PI / 2 - Math.atan2(deltaY, deltaX2),
  ];
}

function makeGradient(
  context: CanvasRenderingContext2D,
  type: ColumnType,
  height: number,
  to: Point,
  from: Point
) {
  // const gradient = context.createLinearGradient(0, 0, 0, height);
  const gradient = context.createLinearGradient(...to, ...from);

  const cellHeight = 1 / columnTypes[type].length;
  let colCount = 0;
  columnTypes[type].forEach((t, idx) => {
    const color =
      t === '1'
        ? config.colors.fg[colCount % config.colors.fg.length]
        : 'transparent';
    gradient.addColorStop(idx * cellHeight, color);
    gradient.addColorStop((idx + 1) * cellHeight, color);

    if (t === '1') colCount++;
  });
  return gradient;
}

function splitTriangle([a, b, c]: Point[]): Point[][] {
  return [
    [a, b, [a[0], b[1]]],
    [a, c, [a[0], c[1]]],
  ];
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

  const triangleA = computeTriangle(
    [columnWidth, 0],
    [0, columnWidth * 2],
    height
  );
  const triangleB = computeTriangle(
    [columnWidth * 3, 0],
    [columnWidth * 2, columnWidth * 4],
    height
  );
  const angles = [...computeAngles(triangleA), ...computeAngles(triangleB)];

  wrap.render = () => {
    context.fillStyle = config.colors.bg;
    context.fillRect(0, 0, width, height);

    const gradientFilled = makeGradient(
      context,
      'hole',
      height,
      triangleA[0],
      triangleA[1]
    );
    const gradientHole = makeGradient(
      context,
      'filled',
      height,
      triangleA[0],
      triangleA[2]
    );

    // config.colors.fg.forEach((color, index) => {
    //   gradient.addColorStop(index / (config.colors.fg.length - 1), color);
    // });

    // const [tB1, tB2] = splitTriangle(triangleB);
    // context.fillStyle = gradientFilled;
    // drawPath(context, tB1);
    // context.fill();
    // context.stroke();
    // context.fillStyle = gradientHole;
    // drawPath(context, tB2);
    // context.fill();
    // context.stroke();

    const g1 = makeGradient(
      context,
      'filled',
      height,
      triangleA[0],
      triangleA[1]
    );
    const g2 = makeGradient(
      context,
      'hole',
      height,
      triangleA[0],
      triangleA[2]
    );

    for (let i = 0; i < config.columns; i++) {
      const x = i * columnWidth;
      const type: ColumnType = i % 2 === 0 ? 'filled' : 'hole';

      drawColumn(
        type,
        context,
        x,
        columnWidth,
        height,
        i === config.columns - 1 ? 0 : angles[i],
        i % 2 === 0 ? g1 : g2
      );
    }

    context.strokeStyle = '#f00';
    const [tA1, tA2] = splitTriangle(triangleA);
    context.fillStyle = gradientFilled;
    drawPath(context, tA1);
    context.fill();
    // context.stroke();
    context.fillStyle = gradientHole;
    drawPath(context, tA2);
    context.fill();
    // context.stroke();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 2,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

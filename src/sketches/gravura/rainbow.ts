import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

Random.setSeed(Random.getRandomSeed());

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
  dither: true,
};

// 5 columns
// 2 x 2 x 1
// Fill pattern for 2x columns:
// triangle with top vertex in center two columns, base spanning random width at bottom

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
  triangle?: Point[],
  darken?: boolean
) {
  // Clip to column area
  context.save();

  context.beginPath();
  if (triangle) {
    drawPath(context, triangle);
  } else {
    context.rect(x, 0, width, h);
  }
  context.clip();

  context.translate(x + width / 2, h / 2);
  context.rotate(rotation);
  context.translate(-(x + width / 2), -(h / 2));

  const fills = columnTypes[type].reduce<
    Array<{ start: number; count: number }>
  >((acc, val, index) => {
    if (val === '1') {
      const lastFill = acc[acc.length - 1];
      if (lastFill && lastFill.start + lastFill.count === index) {
        lastFill.count++;
      } else {
        acc.push({ start: index, count: 1 });
      }
    }
    return acc;
  }, []);

  const cellHeight = h / columnTypes[type].length;
  fills.forEach(({ start, count }, idx) => {
    const color = config.colors.fg[idx % config.colors.fg.length];
    context.fillStyle = darken
      ? `oklch(from ${color} calc(l * .75) c h)`
      : color;
    const y = start * cellHeight;
    const height = count * cellHeight;

    context.fillRect(x, y, width, height);

    if (triangle) {
      if (type === 'filled') {
        context.fillRect(x - width, y, width, height);
      } else {
        context.fillRect(x + width, y, width, height);
      }
    } else {
      if (type === 'filled') {
        context.fillRect(x + width, y, width, height);
      } else {
        context.fillRect(x - width, y, width, height);
      }
    }
  });
  context.restore();
}

function computeTriangle(
  [x1, y1]: Point,
  columnWidth: number,
  y2: number
): Point[] {
  const xDelta = Random.range(0, columnWidth);
  const vertices: Point[] = [[x1, y1]];
  const x2 = x1 - xDelta;
  vertices.push([x2, y2]);
  const x3 = x1 + xDelta;
  vertices.push([x3, y2]);

  return vertices;
}

function computeAngles([p1, p2, p3]: Point[]): number[] {
  const deltaX1 = p1[0] - p2[0];
  const deltaX2 = p1[0] - p3[0];
  const deltaY = p1[1] - p2[1];

  return [
    Math.PI / 2 + Math.atan2(deltaY, deltaX1),
    Math.PI / 2 + Math.atan2(deltaY, deltaX2),
  ];
}

function splitTriangle([a, b, c]: Point[]): Point[][] {
  return [
    [a, b, [a[0], b[1]]],
    [a, c, [a[0], c[1]]],
  ];
}

export const sketch = ({
  wrap,
  context,
  width,
  height,
  canvas,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const columnWidth = width / config.columns;

  const triangleA = computeTriangle([columnWidth, 0], columnWidth, height);
  const triangleB = computeTriangle([columnWidth * 3, 0], columnWidth, height);
  const angles = [...computeAngles(triangleA), ...computeAngles(triangleB)];

  wrap.render = () => {
    context.fillStyle = config.colors.bg;
    context.fillRect(0, 0, width, height);
    const [tA1, tA2] = splitTriangle(triangleA);
    const [tB1, tB2] = splitTriangle(triangleB);

    const triangles = [tA1, tA2, tB1, tB2];

    for (let i = 0; i < config.columns; i++) {
      const x = i * columnWidth;
      const type: ColumnType = i % 2 === 0 ? 'filled' : 'hole';
      const flippedType: ColumnType = i % 2 === 0 ? 'hole' : 'filled';

      drawColumn(
        type,
        context,
        x,
        columnWidth,
        height,
        i === config.columns - 1 ? 0 : angles[i],
        undefined,
        i % 2 !== 0
      );

      if (triangles[i]) {
        drawColumn(
          flippedType,
          context,
          x,
          columnWidth,
          height,
          i === config.columns - 1 ? 0 : angles[i],
          triangles[i],
          i % 2 !== 0
        );
      }
    }

    if (config.dither) {
      const ditheredImage = scaleCanvasAndApplyDither(
        width,
        height,
        0.75,
        canvas,
        (data) =>
          dither(data, {
            greyscaleMethod: 'none',
            ditherMethod: 'atkinson',
          })
      );

      context.drawImage(ditheredImage, 0, 0, width, height);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [1080, 1080],
  dimensions: [800, 600],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import WebFont from 'webfontloader';
import {
  createNaleeSystem,
  makeDomain,
  xyToCoords,
  clipDomainWithWorldCoords,
} from '../nalee';
import type { Config } from '../nalee';
import {
  createToggleButton,
  drawGrid,
  getRect,
  GridOptions,
  makeGrid,
  Rect,
} from '../../grid';
import { drawShape } from '../nalee/paths';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { formatCss, oklch, wcagContrast } from 'culori';
import { logColors } from '../../colors';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

const config = {
  x: 0.3,
  w: 0.6,
  y: 0.1,
  h: 0.8,
  cols: 3,
  rows: 4,
  gap: [20, 20] as [number, number],
  debug: false,
  showGrid: false,
};

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
  },
).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

function findContrastPair(
  palette: string[],
  ratio: number = 4.5,
  c1?: string,
): [string, string] {
  c1 = c1 ?? (Random.pick(palette) as string);
  const c2: string = Random.pick(
    palette.filter((c) => c !== c1 && wcagContrast(c1, c) >= ratio),
  );

  if (!c2) return findContrastPair(palette, ratio - 1, c1);

  // Remove chosen colors from palette
  const c1Index = palette.indexOf(c1);
  if (c1Index > -1) palette.splice(c1Index, 1);

  const c2Index = palette.indexOf(c2);
  if (c2Index > -1) palette.splice(c2Index, 1);

  return [c1, c2];
}

const bg = Random.pick(palette);
const colors = palette.filter((c) => c !== bg);

const colorPairs = [
  findContrastPair(colors),
  findContrastPair(colors), //.map((c) => `hsl(from ${c} h s l / 0.5)`),
  findContrastPair(colors, 4.5, bg),
];

logColors(palette);

function drawTextInRect(
  context: CanvasRenderingContext2D,
  rect: Rect,
  text: string,
  fg: string,
  bg: string,
) {
  const textHeight = rect.h * 0.5;
  const textY = rect.y + rect.h - textHeight;
  const adjustedRect: Rect = {
    x: rect.x,
    y: textY,
    w: rect.w,
    h: textHeight,
  };

  // Draw rect
  context.fillStyle = bg;
  context.fillRect(
    adjustedRect.x,
    adjustedRect.y,
    adjustedRect.w,
    adjustedRect.h,
  );

  context.font = `${textHeight * 0.5}px Staatliches`;
  context.fillStyle = fg;
  context.textAlign = 'center';
  context.fillText(
    text,
    adjustedRect.x + adjustedRect.w / 2,
    adjustedRect.y + adjustedRect.h / 1.5,
  );
}

export const sketch = async ({
  wrap,
  context,
  width,
  height,
  render,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  await new Promise((resolve) => {
    WebFont.load({
      google: {
        families: ['Staatliches'],
      },
      active: () => {
        resolve(void 0);
      },
    });
  });

  createToggleButton(() => {
    config.showGrid = !config.showGrid;
    render();
  });

  const gridConfig: GridOptions = {
    width,
    height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  };

  const grid = makeGrid(gridConfig);

  const rectToClip = (r: Rect): Point[] => [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];

  const clipRects: Point[][] = [
    getRect(gridConfig, { x: 1, y: 0, w: 2, h: 3.5 }),
    getRect(gridConfig, { x: 0, y: 1, w: 2, h: 2 }),
  ].map(rectToClip);

  function makeSystem(
    size: number = 16,
    clipRect: Point[],
    color: string,
    config: Partial<Config> = {},
  ) {
    const naleeConfig = {
      resolution: [Math.floor(width / size), Math.floor(height / size)],
      size: size,
      stepSize: 4,
      walkerCount: 2,
      padding: 0,
      pathStyle: 'solidStyle',
      flat: true,
      ...config,
    } satisfies Config;

    const domainToWorld = xyToCoords(
      naleeConfig.resolution,
      naleeConfig.padding,
      width,
      height,
    );

    const domain = makeDomain(naleeConfig.resolution, domainToWorld);

    const clippedDomain = clipDomainWithWorldCoords(domain, clipRect);
    return createNaleeSystem(
      clippedDomain,
      naleeConfig,
      domainToWorld,
      [color],
      bg,
    );
  }

  const systemDefs = [
    {
      clipRect: clipRects[0],
      size: 16,
      colors: colorPairs[0],
      config: { padding: 0.001 },
    },
    {
      clipRect: clipRects[1],
      size: 24,
      colors: colorPairs[1],
      config: { padding: 0 },
    },
  ];

  const systems = systemDefs.map(({ clipRect, size, colors, config }) => ({
    system: makeSystem(size, clipRect, colors[1], config),
    bg: colors[0],
  }));

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw composition
    if (config.debug) {
      context.strokeStyle = colors[0];
      clipRects.forEach((path) => {
        drawPath(context, path);
        context.stroke();
      });
    }

    systems.forEach(({ system, bg }, idx) => {
      drawShape(context, clipRects[idx]);
      context.fillStyle = bg;
      context.fill();
      system(props);
    });

    drawTextInRect(
      context,
      getRect(gridConfig, { x: 0, y: 3, w: 3, h: 1 }),
      'bauhaus weimar',
      colorPairs[2][0],
      colorPairs[2][1],
    );

    drawTextInRect(
      context,
      getRect(gridConfig, { x: 0, y: 0, w: 1, h: 1 }),
      '1923',
      colorPairs[2][0],
      colorPairs[2][1],
    );

    drawGrid(context, grid, config.showGrid, colorPairs[2][1]);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600, 800],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

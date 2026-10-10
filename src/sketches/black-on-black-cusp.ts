import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import { cuspPalette, describe } from '../colors/cusphanger';

/**
 * black-on-black-cusp — black-on-black's split and faceting, coloured only
 * from cusphanger's low tier.
 *
 * The grid is split greedily into rectangles, and each rectangle is folded
 * into three quads about a random interior point, as in black-on-black
 * (2025-01-04). There the facets were three near-black P3 greys on pure black;
 * here the canvas is cusphanger's tinted dark ground and every facet is one of
 * the palette's low-tier swatches — each about 1.6:1 against that ground — so
 * the facets part from the ground and from each other only by a slight step
 * in lightness and hue. The relief shows up close and almost vanishes across
 * the room. Display P3 canvas.
 */

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

// A tight, unshuffled ring keeps the three hues neighbours of the ground's
// own, and a slack ramp keeps them greyed: a relief, not a colour scheme.
const palette = cuspPalette({
  ground: 'dark',
  count: 3,
  angle: Random.range(6, 16),
  shuffle: false,
  saturation: 0.25,
});
console.log(describe(palette));

const background = palette.bg.css;
// Facet index → low-tier swatch, shuffled once so each facet direction keeps
// one colour across every region, like the original's three greys.
const colors = Random.shuffle(palette.tiers.low.map((s) => s.css)) as string[];

type Region = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Grid = (number | null)[][];

// Greedy split: from the first free cell, take a random rectangle that fits
// in the free run to the right and below.
function generateAreas(rows: number, cols: number): Region[] {
  const grid: Grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const regions: Region[] = [];
  let rowIndex = 0;

  while (rowIndex < rows) {
    const colIndex = grid[rowIndex].findIndex((cell) => cell === null);
    if (colIndex === -1) {
      rowIndex++;
      continue;
    }

    let maxWidth = 0;
    let maxHeight = 0;
    while (colIndex + maxWidth < cols && grid[rowIndex][colIndex + maxWidth] === null) maxWidth++;
    while (rowIndex + maxHeight < rows && grid[rowIndex + maxHeight][colIndex] === null) maxHeight++;

    const region = {
      id: regions.length,
      x: colIndex,
      y: rowIndex,
      width: Random.rangeFloor(1, maxWidth),
      height: Random.rangeFloor(1, maxHeight),
    };

    for (let row = rowIndex; row < rowIndex + region.height; row++) {
      for (let col = colIndex; col < colIndex + region.width; col++) {
        grid[row][col] = region.id;
      }
    }
    regions.push(region);
  }
  return regions;
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const res = Random.pick([
    [4, 4],
    [3, 3],
  ]) as [number, number];
  const gap = width * 0.01;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];

  // Layout and fold points are fixed once, so every redraw is the same object.
  const facets = generateAreas(res[0], res[1]).map((r) => {
    const x = gap / 2 + r.x * w + gap / 2;
    const y = gap / 2 + r.y * h + gap / 2;
    const rectW = r.width * w - gap;
    const rectH = r.height * h - gap;
    const D = [
      Random.range(x + rectW * 0.25, x + rectW * 0.75),
      Random.range(y + rectH * 0.25, y + rectH * 0.75),
    ];
    const pts = [
      [x, y],
      [D[0], y],
      [x + rectW, y],
      [x + rectW, D[1]],
      [x + rectW, y + rectH],
      [x, y + rectH],
    ];
    return [
      [pts[0], pts[1], D, pts[5]],
      [pts[1], pts[2], pts[3], D],
      [D, pts[3], pts[4], pts[5]],
    ];
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    for (const faces of facets) {
      faces.forEach((face, idx) => {
        context.fillStyle = colors[idx % colors.length];
        context.beginPath();
        drawPath(context, face);
        context.fill();
      });
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);

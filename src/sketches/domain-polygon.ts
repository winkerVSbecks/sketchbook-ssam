import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
import { drawPath } from '@daeinc/draw';
const { colors, background, stroke } = tome.get();

const outline = stroke || colors.pop();

const config = {
  gap: 0.01,
  debug: true,
};

type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type Grid = (number | null)[][];

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const res = Random.pick([
    [5, 5],
    [4, 4],
    [3, 3],
  ]);

  const grid = {
    w: width * 0.75,
    h: height * 0.75,
    x: width * 0.125,
    y: height * 0.125,
  };

  const gap = Math.min(grid.w, grid.h) * config.gap;
  const w = (grid.w - gap) / res[0];
  const h = (grid.h - gap) / res[1];

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const regions = generateRegions(res[1], res[0]).map((r) => {
      const gW = r.width * w - gap;
      const gH = r.height * h - gap;
      const gX = grid.x + gap / 2 + r.x * w + gap / 2;
      const gY = grid.y + gap / 2 + r.y * h + gap / 2;
      return { x: gX, y: gY, width: gW, height: gH };
    });

    const domains = regions.slice(0, 5);
    const polygon = generatePolygon(domains);

    context.fillStyle = Random.pick(colors);
    drawPath(context, polygon, true);
    context.fill();

    context.strokeStyle = outline;
    context.lineWidth = 2;
    regions.forEach((r) => {
      context.strokeRect(r.x, r.y, r.width, r.height);
    });

    context.fillStyle = outline;
    polygon.forEach((point) => {
      context.beginPath();
      context.arc(point[0], point[1], 3, 0, Math.PI * 2);
      context.fill();
    });
  };
};

function generatePolygon(regions: Region[]): Point[] {
  let polygon: Point[] = regions.map((r) => [
    Random.range(r.x, r.x + r.width),
    Random.range(r.y, r.y + r.height),
  ]);

  // Calculate centroid
  const centroid = polygon
    .reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
    .map((coord) => coord / polygon.length);

  // Sort points clockwise
  polygon = polygon.sort((a, b) => {
    const angleA = Math.atan2(a[1] - centroid[1], a[0] - centroid[0]);
    const angleB = Math.atan2(b[1] - centroid[1], b[0] - centroid[0]);
    return angleA - angleB; // Clockwise sorting
  });

  return isConvexPolygon(polygon) ? polygon : generatePolygon(regions);
}

/**
 * Checks if a polygon is convex.
 * A polygon is convex if all interior angles are less than 180 degrees,
 * which can be determined by checking if all cross products of consecutive edges have the same sign.
 */
function isConvexPolygon(vertices: Point[]): boolean {
  // A polygon needs at least 3 vertices
  if (vertices.length < 3) {
    return false;
  }

  // For a convex polygon, all cross products of consecutive edges should have the same sign
  let sign = 0;

  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];
    const afterNext = vertices[(i + 2) % n];

    // Calculate vectors for two consecutive edges
    const edge1 = [next[0] - current[0], next[1] - current[1]];
    const edge2 = [afterNext[0] - next[0], afterNext[1] - next[1]];

    // Calculate cross product (in 2D, it's a scalar: edge1.x * edge2.y - edge1.y * edge2.x)
    const crossProduct = edge1[0] * edge2[1] - edge1[1] * edge2[0];

    // On the first valid cross product, store its sign
    if (crossProduct !== 0) {
      if (sign === 0) {
        sign = Math.sign(crossProduct);
      }
      // If we find a cross product with different sign, the polygon is not convex
      else if (sign * crossProduct < 0) {
        return false;
      }
    }
  }

  return true;
}

function generateRegions(
  rows: number,
  cols: number,
  count: number = 4,
  maxAttempts: number = 100
): Region[] {
  const grid: Grid = Array(rows)
    .fill(null)
    .map(() => Array(cols).fill(null));
  const regions: Region[] = [];

  // while (regions.length < count && maxAttempts > 0) {
  while (maxAttempts > 0) {
    // Pick a random empty cell
    const emptyCells: [number, number][] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] === null) {
          emptyCells.push([y, x]);
        }
      }
    }

    if (emptyCells.length === 0) break;

    const [rowIndex, colIndex] = Random.pick(emptyCells);

    // Calculate maximum possible dimensions from this position
    let maxWidth = 0;
    let maxHeight = 0;

    while (
      colIndex + maxWidth < cols &&
      grid[rowIndex][colIndex + maxWidth] === null
    )
      maxWidth++;

    while (
      rowIndex + maxHeight < rows &&
      grid[rowIndex + maxHeight][colIndex] === null
    )
      maxHeight++;

    // Ensure minimum size of 1x1
    const width = Math.max(1, Random.rangeFloor(1, maxWidth + 1));
    const height = Math.max(1, Random.rangeFloor(1, maxHeight + 1));

    // Check if the entire region is available
    let isAvailable = true;
    for (let y = rowIndex; y < rowIndex + height && isAvailable; y++) {
      for (let x = colIndex; x < colIndex + width && isAvailable; x++) {
        if (y >= rows || x >= cols || grid[y][x] !== null) {
          isAvailable = false;
        }
      }
    }

    if (isAvailable) {
      const region = {
        id: regions.length,
        x: colIndex,
        y: rowIndex,
        width,
        height,
      };

      // Mark region as occupied
      for (let y = rowIndex; y < rowIndex + height; y++) {
        for (let x = colIndex; x < colIndex + width; x++) {
          grid[y][x] = region.id;
        }
      }

      regions.push(region);
    } else {
      maxAttempts--;
    }
  }

  return regions;
}

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

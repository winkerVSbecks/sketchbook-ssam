import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
import { drawPath } from '@daeinc/draw';
import PolyBool from 'polybooljs';
import { randomPalette } from '../colors';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
Random.setSeed('772042');

let { colors } = tome.get();
// let colors = Random.shuffle(randomPalette()).slice(0, 3);

colors = Random.shuffle(randomPalette()).slice(0, 3);
const outline = '#333';

const config = {
  gap: 0.02,
  debug: false,
  invert: Random.chance(),
  res: Random.pick([
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
  ]),
};

type Grid = (number | null)[][];
interface Region {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  debug?: boolean;
}

interface Domain {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  debug?: boolean;
  type: 'default' | 'full-span';
  selected: boolean;
  rect: Point[];
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const { domains, polygon } = generateDomainSystem(width, height);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    domains.forEach((d) => {
      if (!isIsland(d)) {
        context.fillStyle = config.invert ? Random.pick(colors) : '#fff';
        context.fillRect(d.x, d.y, d.width, d.height);
      }
    });

    const clips = domains.map((d) => {
      const clip = PolyBool.intersect(
        { regions: [polygon] },
        { regions: [d.rect] }
      );
      return { area: clip.regions.flat(), island: isIsland(d) };
    });

    context.strokeStyle = outline;
    context.lineWidth = 2;
    clips.forEach((clip) => {
      if (clip.area.length < 3) return;
      context.fillStyle = config.invert ? '#fff' : Random.pick(colors);
      drawPath(context, clip.area, true);

      if (clip.island) {
        context.stroke();
      } else {
        context.fill();
      }
    });

    context.strokeStyle = outline;
    context.lineWidth = 2;
    domains.forEach((d) => {
      if (!isIsland(d)) {
        context.strokeStyle = d.debug ? '#f00' : outline;
        context.strokeRect(d.x, d.y, d.width, d.height);
      }
    });

    if (config.debug) {
      context.fillStyle = Random.pick(colors);
      drawPath(context, polygon, true);
      context.fill();

      context.fillStyle = outline;
      polygon.forEach((point) => {
        context.beginPath();
        context.arc(point[0], point[1], 3, 0, Math.PI * 2);
        context.fill();
      });
    }
  };
};

function isIsland(d: Domain): boolean {
  return d.selected && d.type === 'full-span';
}

function generateDomainSystem(
  width: number,
  height: number,
  attempts: number = 0
): {
  domains: Domain[];
  polygon: Point[];
  chosenDomains: number[];
} {
  const grid = {
    w: width * 0.75,
    h: height * 0.75,
    x: width * 0.125,
    y: height * 0.125,
  };

  const gap = Math.min(grid.w, grid.h) * config.gap;
  const w = (grid.w - gap) / config.res[0];
  const h = (grid.h - gap) / config.res[1];
  const selectionCount = 5;

  try {
    let regions = generateRegions(config.res[1], config.res[0]);

    if (regions.length > 3) {
      regions = combineSmallRegions(regions);
    }

    const domains: Domain[] = regions.map((r, idx) => {
      const gW = r.width * w - gap;
      const gH = r.height * h - gap;
      const gX = grid.x + gap / 2 + r.x * w + gap / 2;
      const gY = grid.y + gap / 2 + r.y * h + gap / 2;
      return {
        id: r.id,
        x: gX,
        y: gY,
        width: gW,
        height: gH,
        debug: r.debug,
        type:
          r.width === config.res[0] || r.height === config.res[1]
            ? 'full-span'
            : 'default',
        selected: idx < selectionCount,
        rect: [
          [gX, gY],
          [gX + gW, gY],
          [gX + gW, gY + gH],
          [gX, gY + gH],
        ] as Point[],
      };
    });

    const polygonDomains = domains.slice(0, selectionCount);
    const polygon = generatePolygon(polygonDomains);

    const chosenDomains = polygonDomains.map((d) => d.id);

    return { domains, polygon, chosenDomains };
  } catch (error: any) {
    if (attempts > 10) {
      const regions = generateRegions(config.res[1], config.res[0]);
      console.error(
        'Failed to generate a domain system',
        regions,
        combineSmallRegions(regions)
      );
      return { domains: [], polygon: [], chosenDomains: [] };
    } else {
      console.log(error.message);
      console.log('Retrying…');
      return generateDomainSystem(width, height, attempts + 1);
    }
  }
}
const hasSmall = (regions: Region[], skipIds: number[]) =>
  regions
    .filter((r) => !skipIds.includes(r.id))
    .some((r) => r.width === 1 && r.height === 1);

function isNeighbour(region: Region, other: Region) {
  if (other.id === region.id) return false;

  // Regions share a vertical edge if they have the same x or x+width
  const shareVerticalEdge =
    region.x === other.x + other.width || other.x === region.x + region.width;

  // Regions share a horizontal edge if they have the same y or y+height
  const shareHorizontalEdge =
    region.y === other.y + other.height || other.y === region.y + region.height;

  // Check horizontal adjacency (x-ranges overlap except at endpoints)
  const horizontalOverlap =
    region.x < other.x + other.width && other.x < region.x + region.width;

  // Check vertical adjacency (y-ranges overlap except at endpoints)
  const verticalOverlap =
    region.y < other.y + other.height && other.y < region.y + region.height;

  // For edge adjacency: (share vertical edge AND y-ranges overlap)
  // OR (share horizontal edge AND x-ranges overlap)
  return (
    (shareVerticalEdge && verticalOverlap) ||
    (shareHorizontalEdge && horizontalOverlap)
  );
}

function combineSmallRegions(regions: Region[]): Region[] {
  const skipIds: number[] = [];

  while (hasSmall(regions, skipIds)) {
    const region = regions
      .filter((r) => !skipIds.includes(r.id))
      .find((r) => r.width === 1 && r.height === 1)!;

    const neighbours = regions.filter((r) => isNeighbour(region, r));

    const suitableNeighbours = neighbours.filter((n) => {
      const nSmall = n.width === 1 && n.height === 1;

      const sameWidth = region.x === n.x && region.width === n.width;
      const sameHeight = region.y === n.y && region.height === n.height;

      return nSmall || sameWidth || sameHeight;
    });

    if (config.debug) {
      console.log({ region, neighbours, suitableNeighbours });
    }

    if (suitableNeighbours.length > 0) {
      const neighbour = suitableNeighbours[0];

      regions = regions.filter(
        (r) => r.id !== neighbour.id && r.id !== region.id
      );

      regions.push({
        id: region.id,
        x: Math.min(region.x, neighbour.x),
        y: Math.min(region.y, neighbour.y),
        width:
          region.y === neighbour.y
            ? region.width + neighbour.width
            : region.width,
        height:
          region.x === neighbour.x
            ? region.height + neighbour.height
            : region.height,
      });

      if (config.debug) {
        console.log('Combining', region, neighbour);
      }
    } else {
      if (config.debug) {
        console.log(
          'No suitable neighbours found for',
          region.id,
          'so skipping it'
        );
      }
      skipIds.push(region.id);
    }
  }

  return regions;
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

/**
 * Generates a convex polygon from a set of regions.
 * The polygon is generated by finding a random location within each region
 *  and sorting their vertices in clockwise order. If the resulting polygon
 * is not convex, the process is repeated.
 */
function generatePolygon(regions: Domain[], attempts: number = 0): Point[] {
  if (attempts > 100) {
    throw new Error('Failed to generate a convex polygon');
  }

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

  return isConvexPolygon(polygon)
    ? polygon
    : generatePolygon(regions, attempts + 1);
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

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

import Random from 'canvas-sketch-util/random';
import PolyBool from 'polybooljs';
import { mapRange, lerp } from 'canvas-sketch-util/math';
import { Domain, Grid, PolygonPart, Region, RelativePolygon } from './types';
import { generatePolygon, generateRelativePolygon } from './polygon-utils';

const url = new URL(import.meta.url);
const debug = url.searchParams.get('debug');

export function isIsland(d: Domain): boolean {
  return d.selected && d.type === 'full-span';
}

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const rectWithInset = (
  x: number,
  y: number,
  w: number,
  h: number,
  inset: number[]
): Point[] =>
  [
    [x + inset[3], y + inset[0]],
    [x + w - inset[3], y + inset[0]],
    [x + w - inset[3], y + h - inset[2]],
    [x + inset[3], y + h - inset[2]],
  ] as Point[];

export function relativePolygonToPolygon(
  relativePolygon: RelativePolygon,
  currentGrid: number[][],
  nextGrid: number[][],
  t: number
): Point[] {
  return relativePolygon.map((p) => {
    const { x, y, width, height } = p.domain.scale(currentGrid, nextGrid, t);

    return [
      mapRange(p.point[0], 0, 1, x, x + width),
      mapRange(p.point[1], 0, 1, y, y + height),
    ];
  });
}

export function polygonToParts(
  domains: Domain[],
  polygon: Point[],
  insetAll: boolean = false
): PolygonPart[] {
  return domains.map((d) => {
    const pIsIsland = isIsland(d);
    const clip = PolyBool.intersect(
      { regions: [polygon] },
      { regions: [pIsIsland && !insetAll ? d.rect : d.rectWithInset] }
    );
    const area = clip.regions.flat();

    if (area.length > 0) {
      d.hasPart = true;
    }

    return {
      area,
      island: pIsIsland,
      domain: d,
    };
  });
}

function generateDomainData(
  regions: Region[],
  params: {
    gap: number;
    w: number;
    h: number;
    selectionCount: number;
    grid: { w: number; h: number; x: number; y: number };
    inset: [number, number, number, number];
    res: [number, number];
  }
) {
  const { gap, w, h, selectionCount, grid, inset, res } = params;

  const distortX = (
    currG: number[][],
    nextG: number[][],
    x: number,
    t: number
  ) => {
    const idx = lerp(currG[0][x], nextG[0][x], t);
    return idx * w;
  };

  const distortY = (
    currG: number[][],
    nextG: number[][],
    y: number,
    t: number
  ) => {
    const idx = lerp(currG[1][y], nextG[1][y], t);
    return idx * h;
  };

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
      region: r,
      type: r.width === res[0] || r.height === res[1] ? 'full-span' : 'default',
      selected: idx < selectionCount,
      hasPart: false,
      rect: rect(gX, gY, gW, gH),
      rectWithInset: rectWithInset(gX, gY, gW, gH, inset),
      raw: {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      },
      scale(currentGrid: number[][], nextGrid: number[][], t: number) {
        const x0 = distortX(currentGrid, nextGrid, r.x, t);
        const y0 = distortY(currentGrid, nextGrid, r.y, t);
        const x1 = distortX(currentGrid, nextGrid, r.x + r.width, t);
        const y1 = distortY(currentGrid, nextGrid, r.y + r.height, t);

        const gW = x1 - x0 - gap;
        const gH = y1 - y0 - gap;
        const gX = grid.x + gap / 2 + x0 + gap / 2;
        const gY = grid.y + gap / 2 + y0 + gap / 2;

        return {
          x: gX,
          y: gY,
          width: gW,
          height: gH,
          rect: rect(gX, gY, gW, gH),
          rectWithInset: rectWithInset(gX, gY, gW, gH, inset),
        };
      },
    };
  });

  const polygonDomains = domains.slice(0, selectionCount);
  const polygon = generatePolygon(polygonDomains);
  const relativePolygon = generateRelativePolygon(polygonDomains);

  const chosenDomains = polygonDomains.map((d) => d.id);

  const polygonParts = polygonToParts(domains, polygon);

  return {
    domains,
    polygon,
    relativePolygon,
    chosenDomains,
    polygonParts,
    grid: { ...grid, gap, xRes: w, yRes: h },
  };
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

    if (debug) {
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

      if (debug) {
        console.log('Combining', region, neighbour);
      }
    } else {
      if (debug) {
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

function combineNarrowRegions(regions: Region[]): Region[] {
  const skipIds: number[] = [];
  let hasChanges = true;

  // Keep combining regions until no more combinations are possible
  while (hasChanges) {
    hasChanges = false;

    // Find narrow regions (width or height = 1)
    const narrowRegions = regions.filter(
      (r) => !skipIds.includes(r.id) && (r.width === 1 || r.height === 1)
    );

    if (narrowRegions.length === 0) break;

    for (const region of narrowRegions) {
      // Skip if this region has already been processed
      if (skipIds.includes(region.id)) continue;

      const neighbours = regions.filter(
        (r) => isNeighbour(region, r) && !skipIds.includes(r.id)
      );

      // Find suitable neighbours that are also narrow or have matching dimensions
      const suitableNeighbours = neighbours.filter((n) => {
        const isNarrow = n.width === 1 || n.height === 1;

        // Check if they can be combined horizontally (same height)
        const canCombineHorizontally =
          region.y === n.y &&
          region.height === n.height &&
          (region.x + region.width === n.x || n.x + n.width === region.x);

        // Check if they can be combined vertically (same width)
        const canCombineVertically =
          region.x === n.x &&
          region.width === n.width &&
          (region.y + region.height === n.y || n.y + n.height === region.y);

        return isNarrow && (canCombineHorizontally || canCombineVertically);
      });

      if (debug) {
        console.log({ region, neighbours, suitableNeighbours });
      }

      if (suitableNeighbours.length > 0) {
        const neighbour = suitableNeighbours[0];

        // Remove both regions from the array
        regions = regions.filter(
          (r) => r.id !== neighbour.id && r.id !== region.id
        );

        // Create a new combined region
        const newRegion = {
          id: region.id,
          x: Math.min(region.x, neighbour.x),
          y: Math.min(region.y, neighbour.y),
          width:
            Math.max(region.x + region.width, neighbour.x + neighbour.width) -
            Math.min(region.x, neighbour.x),
          height:
            Math.max(region.y + region.height, neighbour.y + neighbour.height) -
            Math.min(region.y, neighbour.y),
        };

        regions.push(newRegion);

        if (debug) {
          console.log('Combining', region, neighbour, 'into', newRegion);
        }

        hasChanges = true;
        break; // Start over with the new set of regions
      } else {
        if (debug) {
          console.log(
            'No suitable neighbours found for',
            region.id,
            'so skipping it'
          );
        }
        skipIds.push(region.id);
      }
    }
  }

  return regions;
}

function reduceNarrowRegions(regions: Region[]): Region[] {
  const skipIds: number[] = [];
  let hasChanges = true;

  // Keep combining regions until no more combinations are possible
  while (hasChanges) {
    hasChanges = false;

    // Find narrow regions (width or height = 1)
    const narrowRegions = regions.filter(
      (r) => !skipIds.includes(r.id) && (r.width === 1 || r.height === 1)
    );

    if (narrowRegions.length === 0) break;

    for (const region of narrowRegions) {
      // Skip if this region has already been processed
      if (skipIds.includes(region.id)) continue;

      // Find neighbouring regions that haven't been processed
      const neighbours = regions.filter(
        (r) => isNeighbour(region, r) && !skipIds.includes(r.id)
      );

      // Find suitable neighbours based on alignment rules:
      // - For vertical neighbours: must have same width
      // - For horizontal neighbours: must have same height
      const suitableNeighbours = neighbours.filter((n) => {
        // Check if they can be combined horizontally (same height, adjacent x)
        const canCombineHorizontally =
          region.y === n.y &&
          region.height === n.height &&
          (region.x + region.width === n.x || n.x + n.width === region.x);

        // Check if they can be combined vertically (same width, adjacent y)
        const canCombineVertically =
          region.x === n.x &&
          region.width === n.width &&
          (region.y + region.height === n.y || n.y + n.height === region.y);

        return canCombineHorizontally || canCombineVertically;
      });

      if (debug) {
        console.log({ region, neighbours, suitableNeighbours });
      }

      if (suitableNeighbours.length > 0) {
        const neighbour = suitableNeighbours[0];

        // Remove both regions from the array
        regions = regions.filter(
          (r) => r.id !== neighbour.id && r.id !== region.id
        );

        // Create a new combined region
        const newRegion = {
          id: region.id,
          x: Math.min(region.x, neighbour.x),
          y: Math.min(region.y, neighbour.y),
          width:
            Math.max(region.x + region.width, neighbour.x + neighbour.width) -
            Math.min(region.x, neighbour.x),
          height:
            Math.max(region.y + region.height, neighbour.y + neighbour.height) -
            Math.min(region.y, neighbour.y),
        };

        regions.push(newRegion);

        if (debug) {
          console.log('Combining', region, neighbour, 'into', newRegion);
        }

        hasChanges = true;
        break; // Start over with the new set of regions
      } else {
        if (debug) {
          console.log(
            'No suitable neighbours found for',
            region.id,
            'so skipping it'
          );
        }
        skipIds.push(region.id);
      }
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
 * Generates regions that guaranteed fill the grid using recursive subdivision
 * @param rows - number of rows in the grid
 * @param cols - number of columns in the grid
 * @param minRegions - minimum number of regions to create
 */
function generateSubdividedRegions(
  rows: number,
  cols: number,
  minRegions: number = 4
): Region[] {
  const regions: Region[] = [];
  let idCounter = 0;

  function subdivide(
    x: number,
    y: number,
    w: number,
    h: number,
    depth: number
  ) {
    // Stop subdividing if we have enough regions or the area is too small
    if (regions.length >= minRegions && depth > 0) {
      if (Random.chance(0.7)) {
        regions.push({ id: idCounter++, x, y, width: w, height: h });
        return;
      }
    }

    // Don't subdivide if too small
    if (w <= 1 && h <= 1) {
      regions.push({ id: idCounter++, x, y, width: w, height: h });
      return;
    }

    // Decide whether to split horizontally or vertically
    const canSplitH = w > 1;
    const canSplitV = h > 1;

    if (!canSplitH && !canSplitV) {
      regions.push({ id: idCounter++, x, y, width: w, height: h });
      return;
    }

    const splitHorizontally = canSplitH && (!canSplitV || Random.chance(0.5));

    if (splitHorizontally) {
      const splitAt = Random.rangeFloor(1, w);
      subdivide(x, y, splitAt, h, depth + 1);
      subdivide(x + splitAt, y, w - splitAt, h, depth + 1);
    } else {
      const splitAt = Random.rangeFloor(1, h);
      subdivide(x, y, w, splitAt, depth + 1);
      subdivide(x, y + splitAt, w, h - splitAt, depth + 1);
    }
  }

  subdivide(0, 0, cols, rows, 0);
  return regions;
}

export type DomainSystemState = {
  domains: Domain[];
  polygon: Point[];
  relativePolygon: RelativePolygon;
  chosenDomains: number[];
  polygonParts: PolygonPart[];
  grid: {
    w: number;
    h: number;
    x: number;
    y: number;
    gap: number;
    xRes: number;
    yRes: number;
  };
};

export function* domainSystemGenerator(
  res: [number, number],
  gapScale: number,
  width: number,
  height: number,
  options: {
    inset: [number, number, number, number];
    doCombineSmallRegions?: boolean;
    doCombineNarrowRegions?: boolean;
    doReduceNarrowRegions?: boolean;
    fillMode?: 'random' | 'subdivide';
  } = {
    inset: [0, 0, 0, 0],
    doCombineSmallRegions: true,
    doCombineNarrowRegions: true,
    doReduceNarrowRegions: true,
    fillMode: 'random',
  },
  grid: { w: number; h: number; x: number; y: number } = {
    w: width * 0.75,
    h: height * 0.75,
    x: width * 0.125,
    y: height * 0.125,
  },
  attempts: number = 0
): Generator<DomainSystemState, DomainSystemState, undefined> {
  const {
    inset = [0, 0, 0, 0],
    doCombineSmallRegions = true,
    doCombineNarrowRegions = true,
    doReduceNarrowRegions = true,
    fillMode = 'random',
  } = options;

  const gap = Math.min(grid.w, grid.h) * gapScale;
  const w = (grid.w - gap) / res[0];
  const h = (grid.h - gap) / res[1];
  const selectionCount = 5;
  let state: DomainSystemState = {
    domains: [],
    polygon: [],
    relativePolygon: [],
    chosenDomains: [],
    polygonParts: [],
    grid: { ...grid, gap, xRes: w, yRes: h },
  };

  try {
    // Initial unoptimized state
    let regions =
      fillMode === 'subdivide'
        ? generateSubdividedRegions(res[1], res[0])
        : generateRegions(res[1], res[0]);
    state = generateDomainData(regions, {
      gap,
      w,
      h,
      selectionCount,
      grid,
      inset,
      res,
    });
    yield state;

    // After combining small regions
    if (doCombineSmallRegions && regions.length > 3) {
      regions = combineSmallRegions(regions);
      state = generateDomainData(regions, {
        gap,
        w,
        h,
        selectionCount,
        grid,
        inset,
        res,
      });
      yield state;
    }

    // After combining narrow regions
    if (doCombineNarrowRegions && regions.length > 3) {
      regions = combineNarrowRegions(regions);
      state = generateDomainData(regions, {
        gap,
        w,
        h,
        selectionCount,
        grid,
        inset,
        res,
      });
      yield state;
    }

    // After reducing narrow regions
    if (doReduceNarrowRegions && regions.length > 3 && res[0] > 4) {
      regions = reduceNarrowRegions(regions);
      state = generateDomainData(regions, {
        gap,
        w,
        h,
        selectionCount,
        grid,
        inset,
        res,
      });
      yield state;
    }

    return state;
  } catch (error: any) {
    if (attempts > 10) {
      const regions = generateRegions(res[1], res[0]);
      console.error(
        'Failed to generate a domain system',
        regions,
        combineSmallRegions(regions)
      );
      state = {
        domains: [],
        polygon: [],
        relativePolygon: [],
        chosenDomains: [],
        polygonParts: [],
        grid: { ...grid, gap, xRes: w, yRes: h },
      };
      yield state;
    } else {
      console.log(error.message);
      console.log('Retrying…');
      yield* domainSystemGenerator(
        res,
        gapScale,
        width,
        height,
        options,
        grid,
        attempts + 1
      );
    }
  }

  return state;
}

export function generateDomainSystem(
  res: [number, number],
  gapScale: number,
  width: number,
  height: number,
  options: {
    inset: [number, number, number, number];
    doCombineSmallRegions?: boolean;
    doCombineNarrowRegions?: boolean;
    doReduceNarrowRegions?: boolean;
    fillMode?: 'random' | 'subdivide';
  } = {
    inset: [0, 0, 0, 0],
    doCombineSmallRegions: true,
    doCombineNarrowRegions: true,
    doReduceNarrowRegions: true,
    fillMode: 'random',
  },
  grid: { w: number; h: number; x: number; y: number } = {
    w: width * 0.75,
    h: height * 0.75,
    x: width * 0.125,
    y: height * 0.125,
  },
  attempts: number = 0
): DomainSystemState {
  // Get the generator
  const generator = domainSystemGenerator(
    res,
    gapScale,
    width,
    height,
    options,
    grid,
    attempts
  );

  // Consume all values and return the last one
  let result;
  for (const value of generator) {
    result = value;
  }

  return result!;
}

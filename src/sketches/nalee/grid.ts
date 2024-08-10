import classifyPoint from 'robust-point-in-polygon';
import { xyToCoords, xyToId } from './utils';
import type { Node } from './types';

/**
 * Grid
 */
export function makeGrid(resolution: number): Node[] {
  const grid = [];

  for (let y = 0; y <= resolution; y++) {
    for (let x = 0; x <= resolution; x++) {
      grid.push({ x, y, occupied: false, id: xyToId(x, y) });
    }
  }

  return grid;
}

export function clipGrid(grid: Node[], polygon: Point[]) {
  return grid.filter(({ x, y }) => {
    return classifyPoint(polygon, [x, y]) <= 0;
  });
}

// export function clipGridWorldCoords(
//   grid: Node[],
//   polygon: Point[],
//   resolution: number
// ) {
//   return grid.filter(({ x, y }) => {
//     const [worldX, worldY] = xyToCoords(x, y, resolution, resolution);
//     return classifyPoint(polygon, [worldX, worldY]) <= 0;
//   });
// }

export function makeAsymmetricGrid(): Node[] {
  const grid = [];

  for (let y = 10; y <= 30; y++) {
    for (let x = 30; x <= 60; x++) {
      grid.push({ x, y, occupied: false, id: xyToId(x, y) });
    }
  }

  for (let y = 31; y <= 50; y++) {
    for (let x = 40; x <= 50; x++) {
      grid.push({ x, y, occupied: false, id: xyToId(x, y) });
    }
  }

  for (let y = 40; y <= 50; y++) {
    for (let x = 51; x <= 70; x++) {
      grid.push({ x, y, occupied: false, id: xyToId(x, y) });
    }
  }

  return grid;
}

// export function drawGrid(
//   context: CanvasRenderingContext2D,
//   grid: Node[],
//   width: number,
//   height: number,
//   color: string,
//   size: number
// ) {
//   grid.map(({ x, y }) => {
//     context.fillStyle = color;

//     const [worldX, worldY] = xyToCoords(x, y, width, height);
//     const s = size * 0.25;

//     context.fillRect(worldX - s / 2, worldY - s / 2, s, s);
//   });
// }

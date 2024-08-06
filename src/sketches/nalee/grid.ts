import { config } from './config';
import { xyToCoords } from './utils';
import type { Node } from './types';

/**
 * Grid
 */
export function makeGrid(): Node[] {
  const grid = [];

  for (let y = 0; y <= config.resolution; y++) {
    for (let x = 0; x <= config.resolution; x++) {
      grid.push({ x, y, occupied: false });
    }
  }

  return grid;
}

export function drawGrid(
  context: CanvasRenderingContext2D,
  grid: Node[],
  width: number,
  height: number,
  color: string
) {
  grid.map(({ x, y }) => {
    context.fillStyle = color;

    const [worldX, worldY] = xyToCoords(x, y, width, height);
    const s = config.size * 0.25;

    context.fillRect(worldX - s / 2, worldY - s / 2, s, s);
  });
}

import { mapRange } from 'canvas-sketch-util/math';
import { config } from './config';

/**
 * Utils
 */
// i = x + width*y;
export function xyToIndex(x: number, y: number) {
  return x + (config.resolution + 1) * y;
}

export function inBounds({ x, y }: { x: number; y: number }) {
  return x >= 0 && x <= config.resolution && y >= 0 && y <= config.resolution;
}

export function xyToCoords(
  x: number,
  y: number,
  width: number,
  height: number
): Point {
  return [
    toWorld(x, width, config.resolution, width * 0.03125),
    toWorld(y, height, config.resolution, width * 0.03125),
  ];
}

export function toWorld(
  v: number,
  size: number,
  resolution: number,
  padding: number
) {
  // const s = 0.95 * size;
  // const padding = 0.025 * size;
  const s = size - 2 * padding;
  return padding + mapRange(v, 0, resolution, 0, s);
}

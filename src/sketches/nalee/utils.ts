import { mapRange } from 'canvas-sketch-util/math';
import { config } from './config';
import { Node, Coord } from './types';

/**
 * Utils
 */
export function xyToIndex(nodes: Node[], x: number, y: number) {
  const id = xyToId(x, y);
  return nodes.findIndex((node) => node.id === id);
}

export function xyToId(x: number, y: number) {
  return `${x}-${y}`;
}

export function inBounds(nodes: Node[], { x, y }: Coord) {
  const id = xyToId(x, y);
  return nodes.some((node) => node.id === id);
}

export function xyToCoords(
  x: number,
  y: number,
  width: number,
  height: number
): Point {
  return [
    toWorld(x, width, config.resolution, width * config.padding),
    toWorld(y, height, config.resolution, width * config.padding),
  ];
}

export function toWorld(
  v: number,
  size: number,
  resolution: number,
  padding: number
) {
  const s = size - 2 * padding;
  return padding + mapRange(v, 0, resolution, 0, s);
}

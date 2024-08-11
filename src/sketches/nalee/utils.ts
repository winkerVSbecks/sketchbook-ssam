import { mapRange } from 'canvas-sketch-util/math';
// import { config } from './nalee-system-manager';
import { Node, Coord, DomainToWorld } from './types';

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
  resolution: number,
  padding: number,
  width: number,
  height: number
): DomainToWorld {
  return (x, y) => [
    toWorld(x, width, resolution, width * padding),
    toWorld(y, height, resolution, width * padding),
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

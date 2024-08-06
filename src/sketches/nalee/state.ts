import Random from 'canvas-sketch-util/random';
import { xyToIndex, inBounds } from './utils';
import { makeWalker } from './walker';
import { Node, Walker } from './types';

interface State {
  grid: Node[];
  walkers: Walker[];
  pts: Node[];
  mode: 'draw' | 'complete';
}

export const state: State = {
  grid: [],
  walkers: [],
  pts: [],
  mode: 'draw',
};

export function spawnWalker(colors: string[], initialPosition?: Node) {
  if (state.mode !== 'complete') {
    const start = initialPosition
      ? getPoint(initialPosition.x, initialPosition.y)
      : getStart();

    if (start) {
      const walker = makeWalker(
        start,
        Random.pick(colors),
        Random.pick(colors)
      );
      state.walkers.push(walker);
    }
  }
}

function getPoint(x: number, y: number) {
  return state.grid.find((node) => node.x === x && node.y === y);
}

function getStart() {
  const options = state.grid.filter((cell) => !cell.occupied);
  return Random.pick(options);
}

export function isOccupied({ x, y }: Node) {
  const idx = xyToIndex(x, y);
  return state.grid[idx].occupied;
}

export function setOccupied({ x, y }: Node) {
  const idx = xyToIndex(x, y);
  if (idx >= 0) {
    state.grid[idx].occupied = true;
  }
}

export function validOption(option: Node) {
  return inBounds(option) && !isOccupied(option);
}

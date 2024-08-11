import Random from 'canvas-sketch-util/random';
import { inBounds, xyToIndex } from './utils';
import type { Node, Walker, Coord } from './types';

export class State {
  domain: Node[];
  walkers: Walker[];
  mode: 'draw' | 'complete';

  constructor(domain: Node[]) {
    this.domain = domain;
    this.walkers = [];
    this.mode = 'draw';
  }

  getPoint(x: number, y: number) {
    return this.domain.find((node) => node.x === x && node.y === y);
  }

  getStart() {
    const options = this.domain.filter((cell) => !cell.occupied);
    return Random.pick(options);
  }

  isOccupied({ x, y }: Coord) {
    const idx = xyToIndex(this.domain, x, y);
    return this.domain[idx].occupied;
  }

  setOccupied({ x, y }: Coord) {
    const idx = xyToIndex(this.domain, x, y);
    if (idx >= 0) {
      this.domain[idx].occupied = true;
    }
  }

  validOption = (option: Coord) => {
    return inBounds(this.domain, option) && !this.isOccupied(option);
  };
}

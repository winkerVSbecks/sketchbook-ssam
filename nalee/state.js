import Random from 'canvas-sketch-util/random';
import { inBounds, xyToIndex } from './utils';
export class State {
    domain;
    walkers;
    mode;
    constructor(domain) {
        this.domain = domain;
        this.walkers = [];
        this.mode = 'draw';
    }
    getPoint(x, y) {
        return this.domain.find((node) => node.x === x && node.y === y);
    }
    getStart() {
        const options = this.domain.filter((cell) => !cell.occupied);
        return Random.pick(options);
    }
    isOccupied({ x, y }) {
        const idx = xyToIndex(this.domain, x, y);
        return this.domain[idx].occupied;
    }
    setOccupied({ x, y }) {
        const idx = xyToIndex(this.domain, x, y);
        if (idx >= 0) {
            this.domain[idx].occupied = true;
        }
    }
    validOption = (option) => {
        return inBounds(this.domain, option) && !this.isOccupied(option);
    };
}

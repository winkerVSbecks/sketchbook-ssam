import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const ruleNumber = Random.rangeFloor(0, 255); // Random.pick([156, 135, 214, 195, 151, 246, 250, 190]); //Random.rangeFloor(0, 255); // 156 135 214 195 151 246 250 190
let ruleSet = toBinary(ruleNumber).split(''); //  [0, 1, 0, 1, 1, 0, 1, 0];
Random.setSeed(Random.getRandomSeed());
console.log(ruleNumber, ruleSet);

interface Cell {
  value: number | string;
  color: string;
}

const state = {
  cells: [] as Cell[],
  generations: [] as Cell[][],
  activeGenerations: [] as Cell[][],
  evolving: true,
  evolutionFunction: replaceBottomRow,
};

export const sketch = ({ wrap, context, width }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let count = 66;
  let w = width / count;

  state.cells = Array.from({ length: count }, () => ({
    value: Random.chance() ? 0 : 1,
    color: '#fff',
  }));
  state.generations = [];

  state.generations.push(state.cells);

  for (let i = 1; i < count; i++) {
    state.cells = step(state.cells);
    state.generations.push(state.cells);
  }

  wrap.render = ({ width, height, frame, playhead }: SketchProps) => {
    context.fillStyle = '#fff';
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      state.activeGenerations = [...state.generations, ...state.generations];
    }

    state.activeGenerations.shift();

    // Draw cells
    state.activeGenerations.forEach((cells, generation) => {
      cells.forEach((cell, x) => {
        if (cell.color === '#fff') return;
        context.fillStyle = cell.color;
        context.fillRect(x * w, generation * w, w, w);
      });
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 22,
  exportFps: 22,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

function xor(a: number, b: number) {
  return (a || b) && !(a && b);
}

function step(cells: Cell[]) {
  let nextGen: Cell[] = cells.slice();
  for (let i = 1; i < cells.length - 1; i++) {
    let left = cells[i - 1].value;
    let me = cells[i].value;
    let right = cells[i + 1].value;
    nextGen[i] = rules(left, me, right);
  }

  return nextGen;
}

function rules(a: number | string, b: number | string, c: number | string) {
  let s = '' + a + b + c;
  let index = parseInt(s, 2);
  const inverseIndex = 7 - index;
  const value = xor(Number(ruleSet[inverseIndex]), Number(b));
  return {
    value: ruleSet[inverseIndex],
    color: value ? '#000' : '#fff',
  };
}

function toBinary(n: number) {
  var s = '';
  for (; n >= 0; n /= 2) {
    var rem = n % 2;
    n -= rem;
    s = rem + s;
    if (n == 0) break;
  }
  return s;
}

function replaceBottomRow() {
  state.cells = step(state.cells);
  state.generations.shift();
  state.generations.push(state.cells);
}

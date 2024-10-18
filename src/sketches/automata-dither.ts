import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { palettes as autoAlbersPalettes } from '../colors/auto-albers';
import { palettes as mindfulPalettes } from '../colors/mindful-palettes';
import { scaleCanvasAndApplyDither } from '../scale-canvas-dither';
import { dither } from '../dither';

const ruleNumber = Random.pick([156, 135, 214, 195, 151, 246, 250, 190]); //Random.rangeFloor(0, 255); // 156 135 214 195 151 246 250 190
let ruleSet = toBinary(ruleNumber).split(''); //  [0, 1, 0, 1, 1, 0, 1, 0];
Random.setSeed(Random.getRandomSeed());
console.log(ruleNumber, ruleSet);

const colorSet = Random.boolean()
  ? Random.pick([...mindfulPalettes, ...autoAlbersPalettes])
  : generateColors();
const bg = colorSet.pop()!;

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

  let count = 15;
  let w = width / count;

  state.cells = Array.from({ length: count }, () => ({
    value: Random.chance() ? 0 : 1,
    color: Random.pick(colorSet),
  }));
  state.generations = [];

  state.generations.push(state.cells);

  for (let i = 1; i < count; i++) {
    state.cells = step(state.cells);
    state.generations.push(state.cells);
  }

  wrap.render = ({ width, height, frame, canvas }: SketchProps) => {
    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      state.activeGenerations = [...state.generations, ...state.generations];
    }

    state.activeGenerations.shift();

    // Draw cells
    state.activeGenerations.forEach((cells, generation) => {
      cells.forEach((cell, x) => {
        context.fillStyle = cell.color;
        context.fillRect(x * w, generation * w, w, w);
      });
    });

    const ditheredImage = scaleCanvasAndApplyDither(
      width,
      height,
      0.25,
      canvas,
      (data) =>
        dither(data, {
          greyscaleMethod: 'none',
          ditherMethod: 'atkinson',
        })
    );

    context.drawImage(ditheredImage, 0, 0, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 5,
  exportFps: 5,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

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
  return { value: ruleSet[inverseIndex], color: colorSet[inverseIndex] };
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

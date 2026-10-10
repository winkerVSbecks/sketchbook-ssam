import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clrs } from '../../colors/clrs';
import { drawClixo, drawClixoOutline } from './draw-clixo';

// Fork of clixo/criss-cross: the An+B rule that picked each form's base is
// replaced by an anni-weaving loom draft. Where the draft lifts the warp the
// form is filled and sits on top; where the weft passes over it the form is only
// an outline, laid underneath — so each pick reads as over, under.

Random.setSeed(Random.getRandomSeed());

const colors = [...Random.pick(clrs)];
const bg = colors.pop()!;
const [ring, inner, warp, weft = inner] = Random.shuffle(colors);

const config = {
  xCount: 12,
  yCount: 12,
  trim: true,
  // outline weight as a fraction of r
  line: 0.16,
};

// Drafts, from anni-weaving: true where the warp sits on top
type Draft = (c: number, r: number) => boolean;
const mod = (n: number, m: number) => ((n % m) + m) % m;

const twill =
  (s: number, o: number): Draft =>
  (c, r) =>
    mod(c - r, s) < o;

// twill that mirrors direction every `s` rows
const herringbone =
  (s: number, o: number): Draft =>
  (c, r) => {
    const rm = mod(r, 2 * s);
    return mod(c - (rm < s ? rm : 2 * s - rm - 1), s) < o;
  };

const houndstooth: Draft = (c, r) =>
  [
    [1, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 1, 1, 0],
  ][mod(r, 4)][mod(c, 4)] === 1;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
// floats spaced evenly, no two interlacings adjacent
const satin = (s: number): Draft => {
  let step = 2;
  while (step < s - 1 && gcd(step, s) !== 1) step++;
  return (c, r) => mod(c - r * step, s) < 1;
};

// bands of plain weave between warp floats
const monksBelt =
  (s: number): Draft =>
  (c, r) =>
    mod(r, 2 * s) < s ? (c + r) % 2 === 0 : mod(c, 2 * s) < s;

const basket =
  (n: number): Draft =>
  (c, r) =>
    (Math.floor(c / n) + Math.floor(r / n)) % 2 === 0;

const shaft = Random.pick([3, 4, 5, 6]);
const over = Random.rangeFloor(1, shaft);
const drafts: Record<string, Draft> = {
  twill: twill(shaft, over),
  herringbone: herringbone(shaft, over),
  houndstooth,
  satin: satin(Math.max(5, shaft)),
  "monk's belt": monksBelt(Math.max(2, shaft - 2)),
  basket: basket(2),
};
const draftName = Random.pick(Object.keys(drafts));
const draft = drafts[draftName];
console.log({ seed: Random.getSeed(), draft: draftName, shaft, over });

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const res = [2 * config.xCount + 1, 2 * config.yCount + 1];
    const size = [width / res[0], height / res[1]];
    const r = size[0] / 2;

    const limits = {
      x: [config.trim ? 0 : -2, config.trim ? res[0] - 1 : res[0]],
      y: [config.trim ? 0 : -2, config.trim ? res[1] - 1 : res[1]],
    };

    type Form = { c: number; r: number; cx: number; cy: number; up: boolean };
    const forms: Form[] = [];
    for (let j = limits.y[0]; j < limits.y[1]; j += 2) {
      for (let i = limits.x[0]; i < limits.x[1]; i += 2) {
        // one form per draft cell: column = warp end, row = weft pick
        const c = i / 2;
        const row = j / 2;
        forms.push({ c, r: row, cx: i * size[0] + r, cy: j * size[1] + r, up: draft(c, row) });
      }
    }

    // weft-up forms first, ground-filled with a weft outline
    context.lineWidth = r * config.line;
    context.lineJoin = 'round';
    forms
      .filter((f) => !f.up)
      .forEach((f) => drawClixoOutline(context, f.cx, f.cy, r, { fill: bg, outline: weft }));

    // warp-up forms over them, filled like criss-cross's, rings on the shared corners
    context.lineWidth = 1;
    forms
      .filter((f) => f.up)
      .forEach((f) => drawClixo(context, f.cx, f.cy, r, { ring, inner, base: warp }));
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  framesFormat: ['mp4'],
  prefix: 'loom-draft-',
};

ssam(sketch as Sketch<'2d'>, settings);

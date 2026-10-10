import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import pack from 'pack-spheres';
import { cuspPalette } from '../../colors/cusphanger';

// Twenty-six plates, one a second: each letter of voxels/alphabet-pixel's
// 7×8 pixel font, kept empty while grey-goo's circle packing floods the
// rest of the plate. The letter is never drawn — only the circles are.

Random.setSeed(Random.getRandomSeed());
console.log(`Seed: ${Random.getSeed()}`);

const config = {
  // set to a letter to hold one plate still
  letter: '' as string,
  // letter width as a fraction of the plate
  letterWidth: 0.5,
  margin: 0.06,
  // clear ground between the letter's pixels and the nearest circle, in pixel cells
  gap: 0.06,
  maxCount: 4000,
  packAttempts: 1500,
  minRadius: 0.004,
  maxRadius: 0.16,
  padding: 0.0025,
};

const FONT: Record<string, string[]> = {
  A: ['...#...', '..#.#..', '.#...#.', '#.....#', '#######', '#.....#', '#.....#', '#.....#'],
  B: ['######.', '#.....#', '#.....#', '######.', '#.....#', '#.....#', '#.....#', '######.'],
  C: ['.#####.', '#.....#', '#......', '#......', '#......', '#......', '#.....#', '.#####.'],
  D: ['######.', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '######.'],
  E: ['#######', '#......', '#......', '#####..', '#......', '#......', '#......', '#######'],
  F: ['#######', '#......', '#......', '#####..', '#......', '#......', '#......', '#......'],
  G: ['.#####.', '#.....#', '#......', '#......', '#..####', '#.....#', '#.....#', '.#####.'],
  H: ['#.....#', '#.....#', '#.....#', '#######', '#.....#', '#.....#', '#.....#', '#.....#'],
  I: ['#######', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '#######'],
  J: ['#######', '.....#.', '.....#.', '.....#.', '.....#.', '#....#.', '#....#.', '.####..'],
  K: ['#.....#', '#....#.', '#...#..', '####...', '#...#..', '#....#.', '#.....#', '#.....#'],
  L: ['#......', '#......', '#......', '#......', '#......', '#......', '#......', '#######'],
  M: ['#.....#', '##...##', '#.#.#.#', '#..#..#', '#.....#', '#.....#', '#.....#', '#.....#'],
  N: ['#.....#', '##....#', '#.#...#', '#..#..#', '#...#.#', '#....##', '#.....#', '#.....#'],
  O: ['.#####.', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#####.'],
  P: ['######.', '#.....#', '#.....#', '######.', '#......', '#......', '#......', '#......'],
  Q: ['.#####.', '#.....#', '#.....#', '#.....#', '#..#..#', '#...#.#', '#....##', '.######'],
  R: ['######.', '#.....#', '#.....#', '######.', '#...#..', '#....#.', '#.....#', '#.....#'],
  S: ['.######', '#......', '#......', '.#####.', '......#', '......#', '......#', '######.'],
  T: ['#######', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...'],
  U: ['#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#####.'],
  V: ['#.....#', '#.....#', '#.....#', '.#...#.', '.#...#.', '..#.#..', '..#.#..', '...#...'],
  W: ['#.....#', '#.....#', '#.....#', '#.....#', '#..#..#', '#.#.#.#', '##...##', '#.....#'],
  X: ['#.....#', '#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  Y: ['#.....#', '.#...#.', '..#.#..', '...#...', '...#...', '...#...', '...#...', '...#...'],
  Z: ['#######', '.....#.', '....#..', '...#...', '..#....', '.#.....', '#......', '#######'],
};

const LETTERS = Object.keys(FONT);
const COLS = 7;
const ROWS = 8;

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Circle = { x: number; y: number; r: number; color: string };

// The letter's pixels as rectangles in pack-spheres' [-1, 1] space,
// centred on the plate.
function letterRects(letter: string): Rect[] {
  const cell = (config.letterWidth * 2) / COLS;
  const ox = -(COLS * cell) / 2;
  const oy = -(ROWS * cell) / 2;
  const g = cell * config.gap;
  const rects: Rect[] = [];
  FONT[letter].forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      rects.push({
        x0: ox + x * cell - g,
        y0: oy + y * cell - g,
        x1: ox + (x + 1) * cell + g,
        y1: oy + (y + 1) * cell + g,
      });
    }),
  );
  return rects;
}

// exact circle–rectangle overlap: nearest point on the rect to the centre
const hits = (p: number[], r: number, q: Rect) => {
  const dx = p[0] - Math.max(q.x0, Math.min(p[0], q.x1));
  const dy = p[1] - Math.max(q.y0, Math.min(p[1], q.y1));
  return dx * dx + dy * dy < r * r;
};

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = cuspPalette({ count: 1, ground: Random.pick(['light', 'dark']) });
  const bg = palette.bg.css;
  const inks = [palette.tiers.high[0].css, palette.tiers.mid[0].css];

  // packing is the slow part; each plate is packed once, on first view
  const plates = new Map<string, Circle[]>();
  const plate = (letter: string): Circle[] => {
    const cached = plates.get(letter);
    if (cached) return cached;
    const rects = letterRects(letter);
    const bound = 1 - config.margin * 2;
    const shapes = pack({
      dimensions: 2,
      random: () => Random.value(),
      maxCount: config.maxCount,
      packAttempts: config.packAttempts,
      minRadius: config.minRadius,
      maxRadius: config.maxRadius,
      padding: config.padding,
      outside: (p: number[], r: number, pad: number) =>
        Math.abs(p[0]) + r > bound ||
        Math.abs(p[1]) + r > bound ||
        rects.some((q) => hits(p, r + pad, q)),
    });
    // a big circle takes the ink, the small grain takes the accent
    const circles = shapes.map((s: { position: number[]; radius: number }) => ({
      x: s.position[0],
      y: s.position[1],
      r: s.radius,
      color: s.radius > config.minRadius * 3 ? inks[0] : Random.pick(inks),
    }));
    plates.set(letter, circles);
    return circles;
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const letter =
      config.letter || LETTERS[Math.min(LETTERS.length - 1, Math.floor(playhead * LETTERS.length))];

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const s = Math.min(width, height) / 2;
    context.save();
    context.translate(width / 2, height / 2);
    for (const c of plate(letter)) {
      context.fillStyle = c.color;
      context.beginPath();
      context.arc(c.x * s, c.y * s, c.r * s, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: true,
  duration: 26_000,
  playFps: 1,
  exportFps: 1,
  framesFormat: ['mp4'],
  prefix: 'alphabet-holes-',
};

ssam(sketch as Sketch<'2d'>, settings);

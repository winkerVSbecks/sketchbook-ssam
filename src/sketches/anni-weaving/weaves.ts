import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../colors';

Random.setSeed(Random.getRandomSeed());

console.log({ seed: Random.getSeed() });

type PatternFn = (c: number, r: number, offset: number) => boolean;

// --- Pattern functions ---

function makeTwill(s: number, o: number): PatternFn {
  return (c, r, offset) => (((c - r + offset + 10000 * s) % s) + s) % s < o;
}

function makeHerringbone(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const rMod = ((r % period) + period) % period;
    const rFolded = rMod < s ? rMod : 2 * s - rMod - 1;
    return (((c - rFolded + offset + 10000 * s) % s) + s) % s < o;
  };
}

function makeDiamond(s: number): PatternFn {
  const half = s / 2;
  const o = Math.max(1, Math.floor(s / 4));
  return (c, r, offset) => {
    const raw = (((c - r + offset + 10000 * s) % s) + s) % s;
    const folded = raw < half ? raw : s - raw;
    return folded < o;
  };
}

function makeHoundstooth(scale: number): PatternFn {
  const m = [
    [1, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 1, 1, 0],
  ];
  return (c, r, _offset) => {
    const row = ((Math.floor(r / scale) % 4) + 4) % 4;
    const col = ((Math.floor(c / scale) % 4) + 4) % 4;
    return m[row][col] === 1;
  };
}

function makeBasket(n: number): PatternFn {
  return (c, r, _offset) => {
    const cGroup = Math.floor(c / n);
    const rGroup = Math.floor(r / n);
    return (cGroup + rGroup) % 2 === 0;
  };
}

function makeBrokenTwill(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const cMod = ((c % period) + period) % period;
    const dir = cMod < s ? 1 : -1;
    return (((dir * (c - r) + offset + 10000 * s) % s) + s) % s < o;
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function satinStep(s: number): number {
  for (let step = 2; step < s - 1; step++) {
    if (gcd(step, s) === 1) return step;
  }
  return 2;
}

function makeSatin(s: number): PatternFn {
  const step = satinStep(s);
  return (c, r, offset) =>
    (((c - r * step + Math.floor(offset) + 10000 * s) % s) + s) % s < 1;
}

function makeCheckerboard(): PatternFn {
  return (c, r, _offset) => (c + r) % 2 === 0;
}

function makeWaffle(s: number): PatternFn {
  return (c, r, _offset) => {
    const cm = ((c % s) + s) % s;
    const rm = ((r % s) + s) % s;
    return cm === 0 || rm === 0;
  };
}

function makeZigzag(s: number, amplitude: number): PatternFn {
  const period = 2 * amplitude;
  return (c, r, offset) => {
    const rMod = ((r % period) + period) % period;
    const zigzagOffset = rMod < amplitude ? rMod : period - rMod;
    return (
      (((c - zigzagOffset + offset + 10000 * s) % s) + s) % s < Math.ceil(s / 2)
    );
  };
}

function makeOvershot(blockSize: number): PatternFn {
  const period = blockSize * 2;
  return (c, r, _offset) => {
    const cm = ((c % period) + period) % period;
    const rm = ((r % period) + period) % period;
    const inBlock =
      cm >= blockSize / 2 &&
      cm < (blockSize * 3) / 2 &&
      rm >= blockSize / 2 &&
      rm < (blockSize * 3) / 2;
    if (inBlock) {
      const bc = cm - blockSize / 2;
      const br = rm - blockSize / 2;
      const center = blockSize / 2;
      const dist = Math.abs(bc - center) + Math.abs(br - center);
      return dist < center;
    }
    return (c + r) % 2 === 0;
  };
}

function makeBirdsEye(s: number): PatternFn {
  const period = s * 2;
  return (c, r, _offset) => {
    const cm = ((c % period) + period) % period;
    const rm = ((r % period) + period) % period;
    const cx = cm < s ? cm : period - cm - 1;
    const cy = rm < s ? rm : period - rm - 1;
    return cx + cy < Math.max(1, Math.floor(s / 2));
  };
}

function makeRosepath(s: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const wave = Math.floor(Math.sin((r / s) * Math.PI) * (s / 2));
    const shifted = c - wave + offset;
    const rMod = ((r % period) + period) % period;
    const rFolded = rMod < s ? rMod : 2 * s - rMod - 1;
    return (((shifted - rFolded + 10000 * s) % s) + s) % s < Math.ceil(s / 3);
  };
}

function makeConcentricDiamond(s: number): PatternFn {
  const half = Math.floor(s / 2);
  return (c, r, _offset) => {
    const cm = ((c % s) + s) % s;
    const rm = ((r % s) + s) % s;
    const dx = cm < half ? cm : s - 1 - cm;
    const dy = rm < half ? rm : s - 1 - rm;
    const ring = Math.min(dx, dy);
    return ring % 2 === 0;
  };
}

function makeLace(s: number): PatternFn {
  return (c, r, offset) => {
    const cm = (((c + offset) % s) + s) % s;
    const rm = ((r % s) + s) % s;
    return cm === 0 && rm % 2 === 0;
  };
}

function makePointTwillDiamond(s: number): PatternFn {
  const period = 2 * (s - 1);
  return (c, r, offset) => {
    const cm = ((c % period) + period) % period;
    const rm = ((r % period) + period) % period;
    const cFolded = cm < s ? cm : period - cm;
    const rFolded = rm < s ? rm : period - rm;
    return (
      (((cFolded - rFolded + offset + 10000 * s) % s) + s) % s <
      Math.ceil(s / 3)
    );
  };
}

// Pick one pattern for the whole image
const shaft = Random.pick([4, 6, 8]);
const over = Random.rangeFloor(1, shaft);

const pattern: PatternFn = Random.pick([
  () => makeTwill(shaft, over),
  () => makeHerringbone(shaft, over),
  () => makeDiamond(shaft),
  () => makeHoundstooth(Random.rangeFloor(1, 3)),
  () => makeBasket(Random.rangeFloor(2, 4)),
  () => makeBrokenTwill(shaft, over),
  () => makeSatin(shaft),
  () => makeCheckerboard(),
  () => makeWaffle(Random.pick([3, 4, 5, 6])),
  () => makeZigzag(shaft, Random.pick([3, 4, 6])),
  () => makeOvershot(Random.pick([4, 6, 8])),
  () => makeBirdsEye(Random.pick([3, 4, 5])),
  () => makeRosepath(Random.pick([4, 6, 8])),
  () => makeConcentricDiamond(Random.pick([6, 8, 10, 12])),
  () => makeLace(Random.pick([3, 4, 5])),
  () => makePointTwillDiamond(Random.pick([6, 8, 10])),
])();

const palette = randomPalette();
const [warpColor, weftColor, bgColor] = Random.shuffle(palette).slice(0, 3);

const config = {
  threads: 80,
  pad: 0.05,
  threadGap: 0.15,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'threads', { min: 16, max: 200, step: 1 });
pane.addBinding(config, 'pad', { min: 0, max: 0.15, step: 0.005 });
pane.addBinding(config, 'threadGap', { min: 0, max: 0.5, step: 0.01 });

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const pad = width * config.pad;
    const weaveW = width - pad * 2;
    const weaveH = height - pad * 2;
    const threadW = weaveW / config.threads;
    const threadH = weaveH / config.threads;
    const inset = threadW * config.threadGap * 0.5;

    context.fillStyle = bgColor;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(pad, pad);

    // Draw warp threads (vertical) as background
    context.fillStyle = warpColor;
    for (let c = 0; c < config.threads; c++) {
      context.fillRect(c * threadW + inset, 0, threadW - inset * 2, weaveH);
    }

    // Draw weft threads (horizontal) where weft is on top
    context.fillStyle = weftColor;
    for (let r = 0; r < config.threads; r++) {
      for (let c = 0; c < config.threads; c++) {
        if (!pattern(c, r, playhead * 8)) {
          context.fillRect(
            c * threadW,
            r * threadH + inset,
            threadW,
            threadH - inset * 2,
          );
        }
      }
    }

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);

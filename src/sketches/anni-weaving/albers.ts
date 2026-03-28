import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

Random.setSeed(Random.getRandomSeed());

console.log({ seed: Random.getSeed() });

type PatternFn = (c: number, r: number) => boolean;

// --- Albers-inspired earthy palettes ---
const albersPalettes = [
  ['#2b2b2b', '#8b4513', '#cd853f', '#daa520', '#f5f5dc', '#a0522d'],
  ['#1a1a2e', '#c45b28', '#e8a838', '#f5e6c8', '#6b3a2a', '#d4a574'],
  ['#2d2d2d', '#b22222', '#d2691e', '#f4a460', '#faf0e6', '#8b6914'],
  ['#1c1c1c', '#704214', '#c8a24e', '#e6d5a8', '#a0522d', '#deb887'],
  ['#3b3b3b', '#943126', '#cc7722', '#e6c35c', '#f0ead6', '#6b4423'],
];

// --- Pattern functions (static, no offset) ---

function makeTwill(s: number, o: number): PatternFn {
  return (c, r) => (((c - r + 10000 * s) % s) + s) % s < o;
}

function makeHerringbone(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r) => {
    const rMod = ((r % period) + period) % period;
    const rFolded = rMod < s ? rMod : 2 * s - rMod - 1;
    return (((c - rFolded + 10000 * s) % s) + s) % s < o;
  };
}

function makeDiamond(s: number): PatternFn {
  const half = s / 2;
  const o = Math.max(1, Math.floor(s / 4));
  return (c, r) => {
    const raw = (((c - r + 10000 * s) % s) + s) % s;
    const folded = raw < half ? raw : s - raw;
    return folded < o;
  };
}

function makeBasket(n: number): PatternFn {
  return (c, r) => {
    const cGroup = Math.floor(c / n);
    const rGroup = Math.floor(r / n);
    return (cGroup + rGroup) % 2 === 0;
  };
}

function makeBrokenTwill(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r) => {
    const cMod = ((c % period) + period) % period;
    const dir = cMod < s ? 1 : -1;
    return (((dir * (c - r) + 10000 * s) % s) + s) % s < o;
  };
}

function makeCheckerboard(): PatternFn {
  return (c, r) => (c + r) % 2 === 0;
}

function makePointTwillDiamond(s: number): PatternFn {
  const period = 2 * (s - 1);
  return (c, r) => {
    const cm = ((c % period) + period) % period;
    const rm = ((r % period) + period) % period;
    const cFolded = cm < s ? cm : period - cm;
    const rFolded = rm < s ? rm : period - rm;
    return (((cFolded - rFolded + 10000 * s) % s) + s) % s < Math.ceil(s / 3);
  };
}

function makeConcentricDiamond(s: number): PatternFn {
  const half = Math.floor(s / 2);
  return (c, r) => {
    const cm = ((c % s) + s) % s;
    const rm = ((r % s) + s) % s;
    const dx = cm < half ? cm : s - 1 - cm;
    const dy = rm < half ? rm : s - 1 - rm;
    const ring = Math.min(dx, dy);
    return ring % 2 === 0;
  };
}

function makePlainWeave(): PatternFn {
  return (c, r) => (c + r) % 2 === 0;
}

type CellType = 'weave' | 'solid' | 'stripes';

interface Cell {
  type: CellType;
  colWeight: number;
  pattern: PatternFn;
  warpColor: string;
  weftColor: string;
  stripeCount: number;
}

interface Band {
  weight: number;
  cells: Cell[];
}

function pickRandomPattern(): PatternFn {
  const shaft = Random.pick([4, 6, 8]);
  const over = Random.rangeFloor(1, shaft);
  return Random.pick([
    () => makeTwill(shaft, over),
    () => makeHerringbone(shaft, over),
    () => makeDiamond(shaft),
    () => makeBasket(Random.rangeFloor(2, 4)),
    () => makeBrokenTwill(shaft, over),
    () => makeCheckerboard(),
    () => makePointTwillDiamond(Random.pick([6, 8, 10])),
    () => makeConcentricDiamond(Random.pick([6, 8, 10])),
    () => makePlainWeave(),
  ])();
}

function makeCell(palette: string[]): Cell {
  const colors = Random.shuffle([...palette]);
  const type: CellType = Random.pick([
    'weave',
    'solid',
    'solid',
    'stripes',
    'stripes',
    'solid',
  ]);

  if (type === 'solid') {
    return {
      type: 'solid',
      colWeight: Random.range(0.5, 3),
      pattern: makePlainWeave(),
      warpColor: colors[0],
      weftColor: colors[0],
      stripeCount: 0,
    };
  } else if (type === 'stripes') {
    return {
      type: 'stripes',
      colWeight: Random.range(0.5, 2),
      pattern: makePlainWeave(),
      warpColor: colors[0],
      weftColor: colors[1],
      stripeCount: Random.rangeFloor(2, 7),
    };
  } else {
    return {
      type: 'weave',
      colWeight: Random.range(1, 4),
      pattern: pickRandomPattern(),
      warpColor: colors[0],
      weftColor: colors[1],
      stripeCount: 0,
    };
  }
}

function generateBands(count: number, palette: string[]): Band[] {
  const bands: Band[] = [];
  for (let i = 0; i < count; i++) {
    // Decide how many vertical columns this band has
    // Most bands are 1 column (full-width), some split into 2-3
    const numCols = Random.pick([1, 1, 1, 2, 2, 3]);
    const cells: Cell[] = [];
    for (let j = 0; j < numCols; j++) {
      cells.push(makeCell(palette));
    }

    // Thin bands (solid/stripes dominant) vs wide bands
    const isThin = cells.every((c) => c.type !== 'weave');
    bands.push({
      weight: isThin ? Random.range(0.1, 0.6) : Random.range(1.0, 4.0),
      cells,
    });
  }
  return bands;
}

const palette = Random.pick(albersPalettes);
const bgColor = palette[palette.length - 1];
const cellColors = palette.filter((c: string) => c !== bgColor);

let bands = generateBands(14, cellColors);

const config = {
  mode: 'fibers' as 'rect' | 'fibers',
  bands: 14,
  threads: 100,
  fibers: 3,
  pad: 0.04,
  threadGap: 0.12,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'mode', {
  options: { rect: 'rect', fibers: 'fibers' },
});
pane.addBinding(config, 'bands', { min: 3, max: 20, step: 1 });
pane.addBinding(config, 'threads', { min: 40, max: 200, step: 1 });
pane.addBinding(config, 'fibers', { min: 1, max: 8, step: 1 });
pane.addBinding(config, 'pad', { min: 0, max: 0.1, step: 0.005 });
pane.addBinding(config, 'threadGap', { min: 0, max: 0.5, step: 0.01 });

pane.on('change', (ev: any) => {
  if (ev.presetKey === 'bands') {
    bands = generateBands(config.bands, cellColors);
  }
});

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    const pad = width * config.pad;
    const weaveW = width - pad * 2;
    const weaveH = height - pad * 2;
    const threadW = weaveW / config.threads;
    const inset = threadW * config.threadGap * 0.5;

    context.fillStyle = bgColor;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(pad, pad);

    // Compute band heights from weights
    const totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
    let bandY = 0;

    for (const band of bands) {
      const bandH = (band.weight / totalWeight) * weaveH;

      // Compute column widths from cell weights
      const totalColWeight = band.cells.reduce((s, c) => s + c.colWeight, 0);
      let cellX = 0;

      for (const cell of band.cells) {
        const cellW = (cell.colWeight / totalColWeight) * weaveW;
        const colThreads = Math.max(1, Math.round(cellW / threadW));
        const cellThreadW = cellW / colThreads;
        const cellInset = cellThreadW * config.threadGap * 0.5;

        context.save();
        context.beginPath();
        context.rect(cellX, bandY, cellW, bandH);
        context.clip();

        // All cell types render through the weave engine
        // Solid cells: warp === weft color, plain weave pattern
        // Stripe cells: alternating warp/weft per row via pattern
        // Weave cells: full pattern with distinct colors
        const rowCount = Math.max(1, Math.round(bandH / cellThreadW));
        const threadH = bandH / rowCount;

        if (config.mode === 'fibers') {
          const fiberW = (cellThreadW - cellInset * 2) / config.fibers;
          const fiberGap = fiberW * 0.2;

          context.strokeStyle = cell.warpColor;
          context.lineWidth = fiberW - fiberGap;
          for (let c = 0; c < colThreads; c++) {
            const x0 = cellX + c * cellThreadW + cellInset;
            for (let f = 0; f < config.fibers; f++) {
              const fx = x0 + f * fiberW + fiberW * 0.5;
              context.beginPath();
              context.moveTo(fx, bandY);
              context.lineTo(fx, bandY + bandH);
              context.stroke();
            }
          }

          for (let r = 0; r < rowCount; r++) {
            context.strokeStyle =
              cell.type === 'stripes'
                ? r % 2 === 0
                  ? cell.weftColor
                  : cell.warpColor
                : cell.weftColor;
            context.lineWidth = fiberW - fiberGap;
            for (let c = 0; c < colThreads; c++) {
              if (!cell.pattern(c, r)) {
                const x0 = cellX + c * cellThreadW;
                const y0 = bandY + r * threadH + cellInset;
                const h = threadH - cellInset * 2;
                const fiberStep = cellThreadW / config.fibers;
                for (let f = 0; f < config.fibers; f++) {
                  const fx = x0 + f * fiberStep + fiberStep * 0.5;
                  context.beginPath();
                  context.moveTo(fx, y0);
                  context.lineTo(fx, y0 + h);
                  context.stroke();
                }
              }
            }
          }
        } else {
          context.fillStyle = cell.warpColor;
          for (let c = 0; c < colThreads; c++) {
            context.fillRect(
              cellX + c * cellThreadW + cellInset,
              bandY,
              cellThreadW - cellInset * 2,
              bandH,
            );
          }

          for (let r = 0; r < rowCount; r++) {
            context.fillStyle =
              cell.type === 'stripes'
                ? r % 2 === 0
                  ? cell.weftColor
                  : cell.warpColor
                : cell.weftColor;
            for (let c = 0; c < colThreads; c++) {
              if (!cell.pattern(c, r)) {
                context.fillRect(
                  cellX + c * cellThreadW,
                  bandY + r * threadH + cellInset,
                  cellThreadW,
                  threadH - cellInset * 2,
                );
              }
            }
          }
        }

        context.restore();
        cellX += cellW;
      }

      bandY += bandH;
    }

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);

/**
 * one-line — thick-nalee with a single walker: one line through every node of
 * the lattice (a random Hamiltonian path, as in ../nalee-one-line), drawn so
 * thick it fills the canvas, its area then filled by one differential-growth
 * organism seeded down its centreline. One band, one wash, one ink, on paper.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { cuspPalette } from '../../colors/cusphanger';
import { createBandField } from './bands';
import { hamiltonianPath } from './region';

const WARMUP_STEPS = 500;
const WARMUP_MS = 6000;
const STEPS_PER_FRAME = 2;
/** Curve width, as a fraction of the repulsion radius. */
const STROKE = 0.55;
/** Draw each region's outline as a hairline, to see the bands the curves are held in. */
const DEBUG = false;
/** WCAG targets against the paper: ink for the curve, wash for the band behind it. */
const CONTRAST = { high: 12, low: 1.6 };

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log(seed);

  // Paper ground; each band filled with its hue's wash and drawn in the same
  // hue's ink, pushed past the default 9:1 so line on fill holds ≈7.5:1.
  const palette = cuspPalette({ count: 1, ground: 'light', targets: CONTRAST });
  const bg = palette.bg.css;
  const inks = palette.tiers.high.map((s) => s.css);
  const fills = palette.tiers.low.map((s) => s.css);
  const hairline = palette.tiers.low[0].css;

  const lattice = Random.pick([5, 6, 7]);
  const field = createBandField([hamiltonianPath(lattice, lattice)], {
    lattice,
    pitch: 4,
    band: 3,
    cell: 2,
    margin: 0.45,
    seed: () => Random.rangeFloor(1, 0xffffff),
  });

  const t0 = performance.now();
  for (let i = 0; i < WARMUP_STEPS && performance.now() - t0 < WARMUP_MS; i++) field.step();

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < STEPS_PER_FRAME; i++) field.step();

    const scale = Math.min(width, height) * (0.88 / field.extent);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate((width - field.extent * scale) / 2, (height - field.extent * scale) / 2);

    if (DEBUG) {
      context.strokeStyle = hairline;
      context.lineWidth = 1;
      context.beginPath();
      for (const [x0, y0, x1, y1] of field.edges) {
        context.moveTo(x0 * scale, y0 * scale);
        context.lineTo(x1 * scale, y1 * scale);
      }
      context.stroke();
    }

    field.rects.forEach((rects, i) => {
      context.fillStyle = fills[i % fills.length];
      context.beginPath();
      for (const [x, y, w, h] of rects) context.rect(x * scale, y * scale, w * scale, h * scale);
      context.fill();
    });

    context.lineJoin = 'round';
    context.lineCap = 'round';
    field.organisms.forEach((growth, i) => {
      context.strokeStyle = inks[i % inks.length];
      context.lineWidth = growth.params.repulsionRadius * STROKE * scale;
      context.beginPath();
      growth.state.nodes.forEach((p, j) => {
        if (j === 0) context.moveTo(p.x * scale, p.y * scale);
        else context.lineTo(p.x * scale, p.y * scale);
      });
      context.closePath();
      context.stroke();
    });

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: true,
  duration: 20000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);

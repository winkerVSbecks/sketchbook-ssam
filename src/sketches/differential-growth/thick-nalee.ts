/**
 * thick-nalee — nalee walks drawn with a line so thick it fills the canvas,
 * then the line itself left empty and its area filled by differential growth.
 *
 * Walkers tile a lattice the nalee way (hold a direction, bounce at walls,
 * die when boxed in or past a drawn length, spawn until every node is taken).
 * Each walk becomes a band three quarters of the lattice pitch wide, so only
 * a thin strip of ground separates bands, and each band holds its own organism (../terminal-ui/growth-sim), seeded as a thin loop
 * down the band's centreline and confined to it — so the walks survive only
 * as the corridors the curves have packed.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { cuspPalette } from '../../colors/cusphanger';
import { createBandField } from './bands';
import { naleeWalks } from './region';

const WARMUP_STEPS = 500;
const WARMUP_MS = 6000;
const STEPS_PER_FRAME = 2;
/** Curve width, as a fraction of the repulsion radius. */
const STROKE = 0.55;

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

  const palette = cuspPalette({ count: Random.rangeFloor(1, 4) });
  const bg = palette.bg.css;
  const inks = palette.tiers.high.map((s) => s.css);
  const hairline = palette.tiers.low[0].css;

  const lattice = Random.pick([6, 7, 8]);
  const field = createBandField(
    naleeWalks(
      lattice,
      lattice,
      () => true,
      () => Random.rangeFloor(lattice, lattice * 3),
    ),
    {
      lattice,
      pitch: 4,
      band: 3,
      cell: 2,
      margin: 0.45,
      seed: () => Random.rangeFloor(1, 0xffffff),
    },
  );

  const t0 = performance.now();
  for (let i = 0; i < WARMUP_STEPS && performance.now() - t0 < WARMUP_MS; i++) field.step();

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < STEPS_PER_FRAME; i++) field.step();

    const scale = Math.min(width, height) * (0.88 / field.extent);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate((width - field.extent * scale) / 2, (height - field.extent * scale) / 2);

    context.strokeStyle = hairline;
    context.lineWidth = 1;
    context.beginPath();
    for (const [x0, y0, x1, y1] of field.edges) {
      context.moveTo(x0 * scale, y0 * scale);
      context.lineTo(x1 * scale, y1 * scale);
    }
    context.stroke();

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

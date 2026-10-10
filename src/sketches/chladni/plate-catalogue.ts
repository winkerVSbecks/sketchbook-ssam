import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { cuspPalette } from '../../colors/cusphanger';

// The Chladni modes as one family: m down the rows, n across the columns,
// each plate settled by chladni/basic's random walk onto its nodal lines.

interface Particle {
  x: number;
  y: number;
}

interface Plate {
  m: number;
  n: number;
  particles: Particle[];
}

const config = {
  seed: 7,
  steps: 5, // m and n each run 1..steps
  a: 1,
  b: 1,
  particleCount: 2600,
  iterations: 420,
  v: 0.1,
  minWalk: 0.002,
  margin: 64,
  gap: 22,
  labelHeight: 18,
  dot: 1.1,
};

Random.setSeed(config.seed);

const palette = cuspPalette({ hue: Random.range(0, 360), count: 1, ground: 'light', gamut: 'srgb' });
const bg = palette.bg.css;
const ink = palette.tiers.high[0].css;
const rule = palette.tiers.low[0].css;
const label = palette.tiers.mid[0].css;

// chladni/basic's closed form — sums two standing waves, returns -1..1 per term
function chladni(x: number, y: number, m: number, n: number): number {
  return (
    config.a * Math.sin(Math.PI * n * x) * Math.sin(Math.PI * m * y) +
    config.b * Math.sin(Math.PI * m * x) * Math.sin(Math.PI * n * y)
  );
}

// Walk each particle with a step proportional to the plate's local amplitude,
// so it keeps moving on the loud antinodes and comes to rest on the quiet lines.
function settlePlate(m: number, n: number): Plate {
  const particles: Particle[] = Array.from({ length: config.particleCount }, () => ({
    x: Random.range(0, 1),
    y: Random.range(0, 1),
  }));
  for (let it = 0; it < config.iterations; it++) {
    for (const p of particles) {
      const amp = Math.max(config.minWalk, config.v * Math.abs(chladni(p.x, p.y, m, n)));
      p.x = Math.min(1, Math.max(0, p.x + Random.range(-amp, amp)));
      p.y = Math.min(1, Math.max(0, p.y + Random.range(-amp, amp)));
    }
  }
  return { m, n, particles };
}

const plates: Plate[] = [];
for (let m = 1; m <= config.steps; m++) {
  for (let n = 1; n <= config.steps; n++) {
    plates.push(settlePlate(m, n));
  }
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const { steps, margin, gap, labelHeight } = config;
    const cell = (Math.min(width, height) - margin * 2 - gap * (steps - 1)) / steps;
    const plateSize = cell - labelHeight;
    const ox = (width - (cell * steps + gap * (steps - 1))) / 2;
    const oy = (height - (cell * steps + gap * (steps - 1))) / 2;

    context.font = '400 11px monospace';
    context.textBaseline = 'alphabetic';

    for (const plate of plates) {
      const col = plate.n - 1;
      const row = plate.m - 1;
      const x0 = ox + col * (cell + gap) + labelHeight / 2;
      const y0 = oy + row * (cell + gap);

      context.strokeStyle = rule;
      context.lineWidth = 1;
      context.strokeRect(x0 + 0.5, y0 + 0.5, plateSize, plateSize);

      context.fillStyle = ink;
      for (const p of plate.particles) {
        context.fillRect(x0 + p.x * plateSize, y0 + p.y * plateSize, config.dot, config.dot);
      }

      context.fillStyle = label;
      context.textAlign = 'left';
      context.fillText(`m ${plate.m}`, x0, y0 + plateSize + 14);
      context.textAlign = 'right';
      context.fillText(`n ${plate.n}`, x0 + plateSize, y0 + plateSize + 14);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

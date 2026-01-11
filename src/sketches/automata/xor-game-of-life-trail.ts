import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { formatCss, oklch } from 'culori';
import { makeGrid } from '../../grid';
import { logColors } from '../../colors';

Random.setSeed(Random.getRandomSeed());

const config = {
  cols: 64 * 2,
  rows: 64 * 2,
  gap: [4, 4],
  initialDensity: 0.2, // Probability of a cell being alive initially
  decayFrames: 4, // Number of frames for a cell to fully fade out
};

const palette = ColorPaletteGenerator.generate(
  { l: Random.range(0, 1), c: Random.range(0, 0.4), h: Random.range(0, 360) },
  Random.pick([
    'analogous',
    'complementary',
    'triadic',
    'tetradic',
    'splitComplementary',
    'tintsShades',
  ]),
  {
    style: Random.pick(['default', 'square', 'triangle', 'circle', 'diamond']),
    modifiers: {
      sine: Random.range(-1, 1),
      wave: Random.range(-1, 1),
      zap: Random.range(-1, 1),
      block: Random.range(-1, 1),
    },
  }
).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

logColors(palette);

// pick the lightest color as background
const bg = palette.reduce((lightest, color) => {
  // Compare lightness values in OKLCH color space
  const lightestL = oklch(lightest)?.l ?? 0;
  const colorL = oklch(color)?.l ?? 0;
  return colorL > lightestL ? color : lightest;
}, palette[0]);

// const bg = palette.shift()!; // '#fff';

function xor(a: number, b: number) {
  return (a || b) && !(a && b);
}

// Game of Life rules
function countNeighbors(
  grid: number[],
  x: number,
  y: number,
  cols: number,
  rows: number
): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      // Wrap around edges (toroidal)
      const nx = (x + dx + cols) % cols;
      const ny = (y + dy + rows) % rows;
      count += grid[ny * cols + nx];
    }
  }
  return count;
}

function stepGameOfLife(
  current: number[],
  cols: number,
  rows: number
): number[] {
  const next: number[] = new Array(current.length).fill(0);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const neighbors = countNeighbors(current, x, y, cols, rows);
      const alive = current[idx];

      // Conway's Game of Life rules
      if (alive) {
        // Cell survives with 2 or 3 neighbors
        next[idx] = neighbors === 2 || neighbors === 3 ? 1 : 0;
      } else {
        // Cell is born with exactly 3 neighbors
        next[idx] = neighbors === 3 ? 1 : 0;
      }
    }
  }

  return next;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  // Initialize pixels with grid data and XOR display value
  let pixels = grid.map((cell) => ({
    ...cell,
    value: 0, // XOR display value
    decay: 0, // Decay counter for trailing effect (0 = fully faded, decayFrames = fully bright)
  }));

  // Initialize Game of Life state randomly
  let gameState: number[] = Array.from(
    { length: config.cols * config.rows },
    () => (Random.chance(config.initialDensity) ? 1 : 0)
  );

  // Previous state for XOR rendering
  let prevState: number[] = new Array(config.cols * config.rows).fill(0);

  wrap.render = ({ frame }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Reset pixels on first frame
    if (frame === 0) {
      pixels = grid.map((cell) => ({
        ...cell,
        value: 0,
        decay: 0,
      }));
      gameState = Array.from({ length: config.cols * config.rows }, () =>
        Random.chance(config.initialDensity) ? 1 : 0
      );
      prevState = new Array<number>(config.cols * config.rows).fill(0);
    }

    // XOR the current game state with the display pixels
    // This creates interesting interference patterns
    for (let i = 0; i < gameState.length; i++) {
      // XOR the change between previous and current state onto display
      if (gameState[i] !== prevState[i]) {
        pixels[i].value = xor(pixels[i].value, 1) ? 1 : 0;
      }

      // Update decay: if pixel is on, set to max decay; otherwise decrease decay
      if (pixels[i].value === 1) {
        pixels[i].decay = config.decayFrames;
      } else if (pixels[i].decay > 0) {
        pixels[i].decay--;
      }
    }

    // Render pixels with decay/trailing effect
    pixels.forEach((pixel) => {
      if (pixel.decay > 0) {
        // Calculate opacity based on decay (1 = full brightness, fading to 0)
        const opacity = pixel.decay / config.decayFrames;
        context.fillStyle = palette[pixel.decay % palette.length]; // `rgba(255, 255, 255, ${opacity})`;
        context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
      }
    });

    // draw grid lines for reference
    context.strokeStyle = 'rgba(255,255,255,.2)';
    for (let c = 0; c <= config.cols; c++) {
      const x = c * (pixels[0].width + config.gap[0]) + config.gap[0] / 2;
      context.beginPath();
      context.moveTo(x, config.gap[0] / 2);
      context.lineTo(x, height - config.gap[0] / 2);
      context.stroke();
    }
    for (let r = 0; r <= config.rows; r++) {
      const y = r * (pixels[0].height + config.gap[1]) + config.gap[1] / 2;
      context.beginPath();
      context.moveTo(config.gap[0] / 2, y);
      context.lineTo(width - config.gap[0] / 2, y);
      context.stroke();
    }

    // Store current state and evolve
    prevState = [...gameState];
    gameState = stepGameOfLife(gameState, config.cols, config.rows);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 1,
  animate: true,
  duration: 30_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

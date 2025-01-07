import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';

type Block = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  row: number;
  col: number;
  ascii: string;
};

const FRACTIONS = 8;
const MIRROR = false;

// █▓▒░■

export const sketch = ({ wrap, context, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let hStart = Random.rangeFloor(0, 360);
  let colors: string[] = generateColors(hStart);
  console.log(colors);

  let tiles: string[] = '█▓▒░'.split('');

  wrap.render = ({ playhead, frame, totalFrames }: SketchProps) => {
    console.clear();
    const step = 360 / totalFrames;
    hStart += step;
    colors = generateColors(hStart);

    const style = (c: string) =>
      `color: ${c}; font-size: 16px; line-height: 1; font-family: monospace;`;

    const rows: string[] = [];
    const gridColors: string[] = [];

    tiles.push(tiles.shift()!);

    for (let y = 0; y < FRACTIONS; y++) {
      let row = '';

      tiles.push(tiles.shift()!);

      for (let x = 0; x < FRACTIONS; x++) {
        row = row.concat(`%c${tiles.join('')}`);
        // row = row.concat('%c█▓▒░');
        gridColors.push(colors[(y + x) % colors.length]);
      }

      rows.push(row);
    }

    const grid = rows.join('\n');
    console.log(grid, ...gridColors.map(style));
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 6,
};

ssam(sketch as Sketch<'2d'>, settings);

// Colors
function generateColors(hStart: number) {
  const s = 0.6; // 0.2, 0.4, 0.6, 0.8
  const l = 0.6; // 0.2, 0.4, 0.6, 0.8

  const colors = generateColorRamp({
    total: FRACTIONS,
    hStart,
    hEasing: (x) => x,
    hCycles: 1 / 3,
    sRange: [s, s],
    lRange: [l, l], // [0.2, 0.6],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'oklch'));

  return colors;
}

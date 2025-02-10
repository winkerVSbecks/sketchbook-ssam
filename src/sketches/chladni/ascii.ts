import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';

const config = {
  // chladni frequency params
  a: 1,
  b: 1,
  // vibration strength params
  minWalk: 0.002,
  particleCount: 10_000,
  v: 0.1,
  drawHeatmap: true,
  // frequencies
  m: Random.rangeFloor(1, 10), //7,
  n: Random.rangeFloor(1, 10), //2,
};

const bg = 'rgb(30, 30, 30)';
const fg = 'white';

// Heatmap chars, dark to light
let chars = [' ', ' ', '.', '*', '#', '@'];

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    // Clear background
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const resolution = 30;

    context.fillStyle = fg;
    context.font = `${resolution / 2}px jgs7`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (let i = 0; i <= width; i += resolution) {
      for (let j = 0; j <= height; j += resolution) {
        let eq = chladni(i / width, j / height);
        const idx = mapRange(eq, -2, 2, 0, chars.length - 1);

        const char = chars[Math.floor(idx)];
        context.fillText(char, i - resolution / 2, j - resolution / 2);
      }
    }
  };
};

// chladni 2D closed-form solution - returns between -1 and 1
function chladni(x: number, y: number): number {
  return (
    config.a *
      Math.sin(Math.PI * config.n * x) *
      Math.sin(Math.PI * config.m * y) +
    config.b *
      Math.sin(Math.PI * config.m * x) *
      Math.sin(Math.PI * config.n * y)
  );
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);

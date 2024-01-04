import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';

export const sketch = ({ wrap, context, width }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // let hStart = Random.rangeFloor(0, 360);
  // const colors = generateColors(hStart);
  const colors = generateColors();

  const w = 100;
  const s = width / w;

  const bg = colors.pop()!;
  let colorCount = colors.length;

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = Math.sin(playhead * Math.PI) * 10;

    for (let x = 0; x < w; x++) {
      for (let y = 0; y < w; y++) {
        const idx = Math.floor(
          // Math.abs(Random.noise3D(x, y, t, 0.05, 6) * colorCount)
          Math.abs(Random.noise3D(x, y, t, 0.02, 1) * colorCount)
        );

        context.fillStyle = colors[idx]; // Random.pick(colors); //[counter % modulo === 0 ? 0 : 1];
        context.fillRect(x * s, y * s, s, s);
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch, settings);

// Colors
function generateColors2(hStart: number) {
  const s = 0.6; // 0.2, 0.4, 0.6, 0.8
  const l = 0.6; // 0.2, 0.4, 0.6, 0.8

  const colors = generateColorRamp({
    total: 24,
    hStart,
    hEasing: (x) => x,
    hCycles: 1 / 3,
    sRange: [0.2, 0.8], // [s, s],
    lRange: [0.2, 0.8], // [l, l], // [0.2, 0.6],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'hsl'));

  return colors;
}

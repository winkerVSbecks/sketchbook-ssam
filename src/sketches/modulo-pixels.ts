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

  let hStart = Random.rangeFloor(0, 360);
  const colors = generateColors2(hStart);
  // const colors = generateColors();

  const bg = colors.pop()!;
  let colorCount = colors.length;

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const tiles = 20;
    const tileSize = width / tiles;
    let y = -1;

    for (let i = 0; i < tiles * tiles; i++) {
      if (i % tiles === 0) {
        y++;
      }

      if (i % frame === 0) {
        // if (i % Math.floor(frame / 16) === 0) {
        // if (i % Math.floor(playhead * 1000) === 0) {
        context.fillStyle = colors[i % colorCount];
        context.fillRect(
          (i % tiles) * tileSize,
          y * tileSize,
          tileSize,
          tileSize
        );
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

ssam(sketch as Sketch<'2d'>, settings);

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

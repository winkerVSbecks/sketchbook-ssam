import { mapRange } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { interpolate, formatHex } from 'culori';
import { generateColors } from '../subtractive-color';

const config = {
  resolution: 100,
  margin: 0.1,
  numWarps: 5,
  warpSize: 1.2,
  falloff: 0.5, // Should be between 0 and 1
  scale: 1,
  frequency: 0.05,
  amplitude: 1,
};

function getWarpedPosition(x: number, y: number, t: number) {
  let scale = config.scale;

  for (let i = 0; i < config.numWarps; i++) {
    // Scale from [-1, 1] to [-warpSize, warpSize]
    const dx =
      config.warpSize *
      Random.noise3D(x, y, t, config.frequency, config.amplitude);
    const dy =
      config.warpSize *
      Random.noise3D(x, y, t, config.frequency, config.amplitude);
    x += scale * dx;
    y += scale * dy;
    scale *= config.falloff;
  }
  return [x, y];
}

const colors = generateColors();
const bg = colors.pop()!;
const colorSale = interpolate(colors);
const colormap = (t: number) => formatHex(colorSale(t));

function getColorAtPosition(x: number, y: number, t: number) {
  // (1 + value)/2 maps from [-1, 1] to [0, 1]
  const value = mapRange(
    Random.noise3D(x, y, t, config.frequency, config.amplitude),
    -1,
    1,
    0,
    1
  );
  const color = colormap(value);
  return color;
}

export const sketch = ({
  wrap,
  context,
  width,
  height,
  playhead,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const margin = width * config.margin;
  const w = (width - 2 * margin) / config.resolution;
  const h = (height - 2 * margin) / config.resolution;
  const r = w * 0.0625;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    const t = Math.sin(playhead * Math.PI) * 50;

    for (let i = 0; i < config.resolution; i++) {
      for (let j = 0; j < config.resolution; j++) {
        const [_x, _y] = getWarpedPosition(i, j, 0);
        const x = margin + _x * w;
        const y = margin + _y * h;

        const radius = mapRange(r, -3.5, 3.5, 0, w * 0.5, true);

        context.fillStyle = getColorAtPosition(i, j, t);
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch, settings);

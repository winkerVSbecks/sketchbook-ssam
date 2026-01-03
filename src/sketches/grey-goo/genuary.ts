import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';
import pack from 'pack-spheres';
import { logColors } from '../../colors';

const config = {};

const bg = '#fff';
const fg = '#000';

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  context.fillStyle = fg;
  // draw text in center
  context.font = `900 ${width / 7}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('GENUARY', width / 2, height / 2);

  const margin = width * 0.05;
  const scale = width - margin * 2;

  const shapes = pack({
    dimensions: 2,
    padding: 0.0025,
    // minRadius: 0.03125,
    // maxRadius: 0.75,
  });

  const circles = shapes.map((shape: any) => ({
    x: mapRange(shape.position[0], -1, 1, margin, width - margin),
    y: mapRange(shape.position[1], -1, 1, margin, height - margin),
    r: (shape.radius * scale) / 2,
  }));

  wrap.render = () => {
    circles.forEach((c: any) => {
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  // dimensions: [800, 600],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

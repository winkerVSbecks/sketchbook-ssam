import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
// import { generateColors } from '../subtractive-color';
import { palettes as autoAlbers } from '../colors/auto-albers';
import { palettes as minfgulPalettes } from '../colors/mindful-palettes';
import { clrs } from '../colors/clrs';
import { drawPath } from '@daeinc/draw';

const colors = Random.pick([...autoAlbers, ...minfgulPalettes, ...clrs]);
const bg = colors.pop()!;

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const U: Point = [0, 0];
    const V: Point = [width, 0];
    const W: Point = [width, height];
    const X: Point = [0, height];
    const frame: Point[] = [U, V, W, X];
    const triangle = randomTriangle([width / 2, height / 2], width / 3);

    context.beginPath();
    drawPath(context, triangle, true);
    context.fill();

    const [A, B, C] = triangle;
    const triangles = [
      [U, A, X],
      [X, A, B],
      [X, B, W],
      [W, B, C],
      [W, C, V],
      [V, C, A],
      [V, A, U],
    ];

    triangles.forEach((triangle, idx) => {
      context.fillStyle = colors[idx % colors.length];
      context.beginPath();
      drawPath(context, triangle, true);
      context.fill();
    });
  };
};

function randomTriangle(center: Point, radius: number): Point[] {
  const angleA = Random.range(Math.PI, (3 * Math.PI) / 2);
  const A: Point = [
    center[0] + Math.cos(angleA) * radius,
    center[1] + Math.sin(angleA) * radius,
  ];
  const angleB = Random.range(Math.PI / 2, Math.PI);
  const B: Point = [
    center[0] + Math.cos(angleB) * radius,
    center[1] + Math.sin(angleB) * radius,
  ];

  const angleC = Random.range(0, Math.PI / 2);
  const C: Point = [
    center[0] + Math.cos(angleC) * radius,
    center[1] + Math.sin(angleC) * radius,
  ];

  return [A, B, C];
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 5_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

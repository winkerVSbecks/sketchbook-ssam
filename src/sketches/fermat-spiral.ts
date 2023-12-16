import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import {
  generateColorRamp,
  colorToCSS,
  colorHarmonies,
  GenerateColorRampArgument,
} from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { lerp, lerpFrames, mapRange } from 'canvas-sketch-util/math';
import { Pane } from 'tweakpane';
import eases from 'eases';

const PARAMS = {
  count: 175,
  cycles: 10,
  a: 40,
  r: 6,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

pane.addBinding(PARAMS, 'count', { min: 0, max: 200, step: 1 });
pane.addBinding(PARAMS, 'cycles', { min: 0, max: 10, step: 1 });
pane.addBinding(PARAMS, 'a', { min: 0, max: 200, step: 1 });
pane.addBinding(PARAMS, 'r', { min: 0, max: 10, step: 0.5 });

const hueStart = Random.rangeFloor(0, 360);
const [hStartBG, hStartA, hStartB] =
  colorHarmonies.splitComplementary(hueStart);

const colorParams: GenerateColorRampArgument = {
  total: PARAMS.count,
  hStartCenter: 0.5,
  hEasing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  sRange: [0.2, 0.35],
  sEasing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  lRange: [0.5, 0.9],
  lEasing: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

export const sketch = ({ wrap, context, duration }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colorsA = generateColorRamp({
    ...colorParams,
    hStart: hStartA,
  }).map((color) => colorToCSS(color, 'oklch'));

  const colorsB = generateColorRamp({
    ...colorParams,
    hStart: hStartB,
  }).map((color) => colorToCSS(color, 'oklch'));

  const bg = generateColorRamp({
    total: 1,
    hStart: hStartBG,
    ...colorParams,
    lRange: [0.1, 0.2],
  }).map((color) => colorToCSS(color, 'oklch'))[0];

  const drawCircle = ({ x, y, r, color }: Circle, style: 'fill' | 'stroke') => {
    context.beginPath();
    context.arc(x, y, r, 0, 2 * Math.PI);

    if (style === 'fill') {
      context.fillStyle = color;
      context.fill();
    } else {
      context.strokeStyle = color;
      context.stroke();
    }
  };

  const angles = Array.from({ length: 125 }, (_, i) => {
    return ((i + 1) / PARAMS.count) * 2 * Math.PI * PARAMS.cycles;
  });

  type Circle = { x: number; y: number; color: string; r: number };
  const circlesA: { x: number; y: number; color: string; r: number }[] = [];
  const circlesB: { x: number; y: number; color: string; r: number }[] = [];

  angles.forEach((angle, idx) => {
    const rA = fermat(PARAMS.a, angle);
    const rB = fermat(PARAMS.a, angle, -1);

    circlesA.push({
      x: Math.cos(angle) * rA,
      y: Math.sin(angle) * rA,
      color: colorsA[idx],
      r: PARAMS.r * 0.5,
    });

    circlesB.push({
      x: Math.cos(angle) * rB,
      y: Math.sin(angle) * rB,
      color: colorsB[idx],
      r: PARAMS.r * 0.5,
    });
  });

  const circles = [...circlesA, ...circlesB];
  const maxDistance = Math.hypot(circles.at(-1)!.x, circles.at(-1)!.y);

  wrap.render = ({ width, height, frame, playhead, time }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(width / 2, height / 2);

    const delay = 0.25;
    const t = mapRange(playhead, 0, 1 - delay, 0, 1);

    const makeCircle = (
      a: number,
      angle: number,
      direction: number,
      color: string
    ) => {
      const r = fermat(a, angle, direction);

      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        color,
        r: PARAMS.r,
      };
    };

    angles.forEach((angle, idx) => {
      const t = Math.abs(
        // Math.sin(
        //   (playhead * Math.PI) / 2 + (-(idx / angles.length) * Math.PI) / 2
        // )
        Math.sin(-(angle * 0.4) / PARAMS.cycles + playhead * Math.PI)
        // Math.sin((-(idx / angles.length) * Math.PI) / 2 + playhead * Math.PI)
      );
      const a = lerp(1, 0.8, t) * PARAMS.a;

      const c1 = makeCircle(a, angle, 1, colorsA[idx]);
      const c2 = makeCircle(a, angle, -1, colorsA[idx]);

      // const d = mapRange(
      //   Math.hypot(c1.x, c1.y),
      //   0,
      //   maxDistance,
      //   0,
      //   Math.PI * 0.6
      // );
      // const t = Math.abs(Math.sin(d + playhead * Math.PI));

      const r = lerp(0, 1, t) * PARAMS.r;

      drawCircle({ ...c1, r }, idx % 2 === 0 ? 'fill' : 'stroke');
      drawCircle({ ...c2, r }, idx % 2 === 0 ? 'fill' : 'stroke');
    });

    context.restore();
  };
};

function fermat(a: number, t: number, direction = 1) {
  return direction * a * Math.pow(t, 0.5);
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [800, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch, settings);

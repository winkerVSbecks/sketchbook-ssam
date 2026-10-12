import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp, mapRange } from 'canvas-sketch-util/math';
import getNormals from 'polyline-normals';
import { drawPath } from '@daeinc/draw';
import { Pane } from 'tweakpane';
import { generateColors } from '../../subtractive-color';

const config = {
  count: 8,
  headX: 0.5,
  headY: 0.3,
  headWidth: 0.42,
  headHeight: 0.36,
  rootSpan: 0.6,
  fan: 0.35,
  rootWidth: 60,
  tipWidth: 4,
  wobble: 0.08,
  bob: 0.02,
  eyeSize: 0.12,
  shadow: 10,
  lineWidth: 20,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

pane.addBinding(config, 'headX', { min: 0.2, max: 0.8, step: 0.01 });
pane.addBinding(config, 'headY', { min: 0.1, max: 0.6, step: 0.01 });
pane.addBinding(config, 'headWidth', { min: 0.1, max: 0.8, step: 0.01 });
pane.addBinding(config, 'headHeight', { min: 0.1, max: 0.6, step: 0.01 });
pane.addBinding(config, 'rootSpan', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'fan', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'rootWidth', { min: 4, max: 150, step: 1 });
pane.addBinding(config, 'tipWidth', { min: 0, max: 40, step: 1 });
pane.addBinding(config, 'wobble', { min: 0, max: 0.3, step: 0.005 });
pane.addBinding(config, 'bob', { min: 0, max: 0.1, step: 0.005 });
pane.addBinding(config, 'eyeSize', { min: 0, max: 0.3, step: 0.01 });
pane.addBinding(config, 'shadow', { min: 0, max: 40, step: 1 });
pane.addBinding(config, 'lineWidth', { min: 0, max: 60, step: 1 });

function wobbly(a: number, b: number, x: number, t: number) {
  return Math.sin(a * x + b * t + 5) + Math.sin(b * x + a * t + 4);
}

interface Tentacle {
  /** Root position across the head's underside, -1 (left) … 1 (right). */
  slot: number;
  /** Length as a fraction of canvas height. */
  length: number;
  color: string;
  accent: string;
  side: 'left' | 'right';
  a: number;
  b: number;
}

interface Head {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      pane.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const colors = generateColors();
  const bg = colors.pop()!;
  const headColor = Random.pick(colors);
  const headAccent = Random.pick(colors);
  const pupil = colors[0];

  // Shuffle the slots so neighbouring tentacles don't share a draw order.
  const tentacles: Tentacle[] = Random.shuffle(
    Array.from({ length: config.count }, (_, idx) => idx),
  ).map((idx: number) => {
    const a = Random.pick([2, 3, 4]);

    return {
      slot: config.count > 1 ? lerp(-1, 1, idx / (config.count - 1)) : 0,
      length: Random.range(0.7, 0.95),
      color: Random.pick(colors),
      accent: Random.pick(colors),
      side: Random.pick(['left', 'right']),
      a,
      b: a,
    };
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.lineWidth = config.lineWidth;
    context.lineJoin = 'round';

    const head = headAt(width, height, playhead);

    tentacles.forEach((tentacle, idx) => {
      const shape = tentacleShape(
        tentacle,
        head,
        width,
        height,
        playhead * Math.PI * 2 + (Math.PI / 2) * idx,
        idx,
      );
      drawWithShadow(context, shape, tentacle.color, tentacle.accent, tentacle.side);
    });

    drawWithShadow(context, headShape(head), headColor, headAccent, 'left');
    drawEyes(context, head, bg, pupil, playhead);
  };
};

/** The mantle bobs once per loop; tentacle roots ride along with it. */
function headAt(width: number, height: number, playhead: number): Head {
  return {
    x: config.headX * width,
    y: config.headY * height + Math.sin(playhead * Math.PI * 2) * config.bob * height,
    rx: (config.headWidth * width) / 2,
    ry: (config.headHeight * height) / 2,
  };
}

/** A bulb: a full dome on top, pinched slightly where it meets the arms. */
function headShape(head: Head, steps: number = 64): Point[] {
  return Array.from({ length: steps }, (_, idx) => {
    const angle = (idx / steps) * Math.PI * 2;
    const below = Math.max(0, Math.sin(angle));
    const pinch = 1 - 0.25 * below;
    return [
      head.x + Math.cos(angle) * head.rx * pinch,
      head.y + Math.sin(angle) * head.ry * (1 - 0.35 * below),
    ] as Point;
  });
}

/**
 * Tentacles hang from the underside of the head, fanning outward. The wobble
 * is zero at the root (so they stay attached) and grows toward the tip, while
 * the width tapers from rootWidth to tipWidth.
 */
function tentacleShape(
  tentacle: Tentacle,
  head: Head,
  width: number,
  height: number,
  t: number,
  off: number,
  steps: number = 24,
): Point[] {
  const rootX = head.x + tentacle.slot * head.rx * config.rootSpan;
  const rootY = head.y;
  const tipX = rootX + tentacle.slot * config.fan * width;
  const tipY = rootY + tentacle.length * height;
  const delta = width * config.wobble;

  const points: Point[] = Array.from({ length: steps }, (_, idx) => {
    const u = idx / (steps - 1);
    const x = lerp(rootX, tipX, u * u);
    const y = lerp(rootY, tipY, u);
    return [x + delta * wobbly(tentacle.a, tentacle.b, off + u * 2, t) * u, y];
  });

  const normals = getNormals(points);
  const shapeA: Point[] = [];
  const shapeB: Point[] = [];

  for (let idx = 0; idx < points.length; idx++) {
    const normal = normals[idx][0];
    const point = points[idx];
    const spread = mapRange(idx, 0, points.length - 1, config.rootWidth, config.tipWidth) / 2;

    shapeA.push([point[0] + normal[0] * spread, point[1] + normal[1] * spread]);
    shapeB.push([point[0] - normal[0] * spread, point[1] - normal[1] * spread]);
  }

  return [...shapeA, ...shapeB.reverse()];
}

/** Fill + stroke a closed shape over an offset accent copy, like the source sketch. */
function drawWithShadow(
  context: CanvasRenderingContext2D,
  shape: Point[],
  color: string,
  accent: string,
  side: 'left' | 'right',
) {
  context.save();
  context.translate(side === 'left' ? -config.shadow : config.shadow, 0);
  fillShape(context, shape, accent);
  context.restore();

  fillShape(context, shape, color);
}

function fillShape(context: CanvasRenderingContext2D, shape: Point[], color: string) {
  context.fillStyle = color;
  context.strokeStyle = color;
  context.beginPath();
  drawPath(context, shape);
  context.closePath();
  context.fill();
  if (config.lineWidth > 0) context.stroke();
}

/** Two eyes on the lower half of the mantle; pupils drift side to side. */
function drawEyes(
  context: CanvasRenderingContext2D,
  head: Head,
  white: string,
  pupil: string,
  playhead: number,
) {
  const r = config.eyeSize * head.rx;
  if (r <= 0) return;
  const look = Math.sin(playhead * Math.PI * 2 * 2) * r * 0.35;

  [-1, 1].forEach((dir) => {
    const ex = head.x + dir * head.rx * 0.4;
    const ey = head.y + head.ry * 0.15;

    context.fillStyle = white;
    context.beginPath();
    context.arc(ex, ey, r, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = pupil;
    context.beginPath();
    context.ellipse(ex + look, ey, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
    context.fill();
  });
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

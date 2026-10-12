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
  headY: 0.46,
  headWidth: 0.28,
  headHeight: 0.22,
  stretch: 3,
  rootSpan: 0.6,
  fan: 0.45,
  length: 0.6,
  curl: 0.8,
  curlTightness: 3,
  rootWidth: 60,
  tipWidth: 3,
  wobble: 0.35,
  cupSize: 0.42,
  cupSpacing: 3,
  cupInset: 0.45,
  cupStart: 0.12,
  cupEnd: 0.92,
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
pane.addBinding(config, 'stretch', { min: 1, max: 4, step: 0.05 });
pane.addBinding(config, 'rootSpan', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'fan', { min: 0, max: 1.5, step: 0.01 });
pane.addBinding(config, 'length', { min: 0.1, max: 1, step: 0.01 });
pane.addBinding(config, 'curl', { min: 0, max: 2, step: 0.01 });
pane.addBinding(config, 'curlTightness', { min: 1, max: 8, step: 0.1 });
pane.addBinding(config, 'rootWidth', { min: 4, max: 150, step: 1 });
pane.addBinding(config, 'tipWidth', { min: 0, max: 40, step: 1 });
pane.addBinding(config, 'wobble', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'cupSize', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'cupSpacing', { min: 1, max: 8, step: 1 });
pane.addBinding(config, 'cupInset', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'cupStart', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'cupEnd', { min: 0, max: 1, step: 0.01 });
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
  /** Length multiplier on config.length (per-tentacle jitter). */
  length: number;
  /** Curl amount multiplier on config.curl (per-tentacle jitter). */
  curl: number;
  /** Which way the tip rolls: 1 = clockwise on screen, -1 = counter-clockwise. */
  curlDir: 1 | -1;
  color: string;
  accent: string;
  /** Rim colour of the suction cups; always differs from `color`. */
  cup: string;
  side: 'left' | 'right';
  a: number;
  b: number;
}

/** A tentacle's centreline with the heading and half-width at each sample. */
interface Spine {
  points: Point[];
  headings: number[];
  halfWidths: number[];
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
    const color = Random.pick(colors);
    const others = colors.filter((c) => c !== color);
    const slot = config.count > 1 ? lerp(-1, 1, idx / (config.count - 1)) : 0;

    return {
      slot,
      length: Random.range(0.8, 1.15),
      curl: Random.range(0.8, 1.25),
      curlDir: curlDirection(slot),
      color,
      accent: Random.pick(colors),
      cup: others.length > 0 ? Random.pick(others) : bg,
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
      const spine = tentacleSpine(
        tentacle,
        head,
        height,
        playhead * Math.PI * 2 + (Math.PI / 2) * idx,
        idx,
      );
      drawWithShadow(context, outline(spine), tentacle.color, tentacle.accent, tentacle.side);
      drawCups(context, spine, tentacle);
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

/**
 * An elongated mantle: the dome above the eyes is stretched upward by
 * `stretch` and tapers slightly toward its crown; below, it pinches in
 * where it meets the arms.
 */
function headShape(head: Head, steps: number = 96): Point[] {
  return Array.from({ length: steps }, (_, idx) => {
    const angle = (idx / steps) * Math.PI * 2;
    const s = Math.sin(angle);
    const above = Math.max(0, -s);
    const below = Math.max(0, s);
    const narrow = 1 - 0.1 * above * above - 0.25 * below;
    const tall = s < 0 ? config.stretch : 1 - 0.35 * below;
    return [head.x + Math.cos(angle) * head.rx * narrow, head.y + s * head.ry * tall] as Point;
  });
}

/** Outer tentacles roll outward; the middle ones pick a side at random. */
function curlDirection(slot: number): 1 | -1 {
  if (Math.abs(slot) < 0.2) return Random.pick([1, -1]);
  return slot > 0 ? -1 : 1;
}

/**
 * Tentacles hang from the underside of the head and curl up at the tips.
 * The centreline is built by walking along it in equal steps and turning the
 * heading as we go: the heading starts pointing down (tilted outward by
 * `fan`) and accumulates `curl` turns, eased by u^curlTightness so the arm
 * stays straight near the root and rolls into a spiral only near the tip.
 * The wobble also bends the heading and grows from zero at the root, so the
 * arms stay attached while the curls breathe. Width tapers root → tip.
 */
function tentacleSpine(
  tentacle: Tentacle,
  head: Head,
  height: number,
  t: number,
  off: number,
  steps: number = 72,
): Spine {
  const length = config.length * tentacle.length * height;
  const ds = length / (steps - 1);
  const heading0 = Math.PI / 2 - tentacle.slot * config.fan;
  const turns = config.curl * tentacle.curl * Math.PI * 2;

  let x = head.x + tentacle.slot * head.rx * config.rootSpan;
  let y = head.y;
  const points: Point[] = [];
  const headings: number[] = [];
  const halfWidths: number[] = [];

  for (let idx = 0; idx < steps; idx++) {
    const u = idx / (steps - 1);
    const heading =
      heading0 +
      tentacle.curlDir * turns * Math.pow(u, config.curlTightness) +
      config.wobble * wobbly(tentacle.a, tentacle.b, off + u * 2, t) * u;
    points.push([x, y]);
    headings.push(heading);
    halfWidths.push(lerp(config.rootWidth, config.tipWidth, u) / 2);
    x += Math.cos(heading) * ds;
    y += Math.sin(heading) * ds;
  }

  return { points, headings, halfWidths };
}

/** Offset the spine both ways along its normals into a closed outline. */
function outline(spine: Spine): Point[] {
  const normals = getNormals(spine.points);
  const shapeA: Point[] = [];
  const shapeB: Point[] = [];

  spine.points.forEach((point, idx) => {
    const normal = normals[idx][0];
    const spread = spine.halfWidths[idx];
    shapeA.push([point[0] + normal[0] * spread, point[1] + normal[1] * spread]);
    shapeB.push([point[0] - normal[0] * spread, point[1] - normal[1] * spread]);
  });

  return [...shapeA, ...shapeB.reverse()];
}

/**
 * A row of suction cups along the inside of the curl. Turning the heading by
 * +curlDir rotates toward heading + curlDir·90°, so that is the inner side.
 * Each cup is a rim disc with the tentacle colour as its hollow, sized off
 * the local width so the row shrinks toward the tip.
 */
function drawCups(context: CanvasRenderingContext2D, spine: Spine, tentacle: Tentacle) {
  if (config.cupSize <= 0) return;
  const last = spine.points.length - 1;
  const from = Math.round(config.cupStart * last);
  const to = Math.round(config.cupEnd * last);

  for (let idx = from; idx <= to; idx += config.cupSpacing) {
    const [px, py] = spine.points[idx];
    const inner = spine.headings[idx] + (tentacle.curlDir * Math.PI) / 2;
    const half = spine.halfWidths[idx] + config.lineWidth / 2;
    const r = half * config.cupSize;
    if (r < 1) continue;
    const cx = px + Math.cos(inner) * half * config.cupInset;
    const cy = py + Math.sin(inner) * half * config.cupInset;

    context.fillStyle = tentacle.cup;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = tentacle.color;
    context.beginPath();
    context.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    context.fill();
  }
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

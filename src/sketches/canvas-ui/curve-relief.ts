import { Bezier } from 'bezier-js';
import Random from 'canvas-sketch-util/random';
import Matter from 'matter-js';
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import {
  createShell,
  createToggleGroup,
  drawFeather,
  iconColors,
  theme,
  type Camera,
  type FeatherPath,
  type Pt,
  type SceneView,
} from '../../ui';

/**
 * Curve relief — four layered "relief" shapes, each a spring chain (matter-js)
 * hung between the top-right and bottom-left corners of the grid and closed
 * through the top-left corner, animating as the physics settles. Ported from a
 * canvas-sketch piece; the chain's seed curve is a quadratic through a control
 * point that is a draggable handle here (in `line` mode), and the physics is
 * exposed as sliders.
 */

/** Chain nodes per curve (the LUT resolution of the seed bezier). */
const STEPS = 30;
/** Node body radius in sim px (the original's `Bodies.polygon(x, y, 0, 30)` — a circle). */
const NODE_RADIUS = 30;
/** Sim px per world unit: the original 1080 px canvas spans the grid's 4 units. */
const SIM_SCALE = 270;
/** Longest physics step per frame (ms), so a stalled tab doesn't explode the springs. */
const MAX_DT = 1000 / 30;

const HANDLE_COLOR = '#8a5cf5';
/** Translucent handle fill derived from the handle colour (CSS relative colour syntax). */
const HANDLE_FILL = `rgb(from ${HANDLE_COLOR} r g b / 0.55)`;
const HANDLE_RADIUS = 18;

/**
 * Feather `rotate-ccw` in the 24-unit viewBox: the arrow head (`1 4 1 10 7 10`)
 * and `M3.51 15 a9 9 0 1 0 2.13 -9.36 L1 10` — the large counter-clockwise arc
 * of the circle about (12, 12), radius 9, from (3.51, 15) to (5.64, 5.64).
 */
const ROTATE_CCW: FeatherPath[] = [
  (ctx) => {
    ctx.moveTo(1, 4);
    ctx.lineTo(1, 10);
    ctx.lineTo(7, 10);
  },
  (ctx) => {
    ctx.moveTo(3.51, 15);
    ctx.arc(12, 12, 9, Math.atan2(15 - 12, 3.51 - 12), Math.atan2(5.64 - 12, 5.64 - 12), true);
    ctx.lineTo(1, 10);
  },
];

// --- Colour ------------------------------------------------------------------------
// The original's `Lch(L, c, h)` (sketchbook/clrs.js) is OKLCH, not CIE LCH: L and
// c are ÷100 into OKLab, converted to sRGB and each channel truncated and clamped
// to 0–255 — so `Lch(100, 70, h)` is a deliberately out-of-gamut colour that the
// clamp turns into a saturated one. Ported exactly so the four fills read as four
// distinct colours. `hue` (the slider) is added to every fill so the whole relief
// rotates round the wheel together.

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const linearToGamma = (c: number) => (c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c);

/** OKLab → sRGB 0–255, truncating and clamping each channel like the original. */
const oklabToRGB = (l: number, a: number, b: number): [number, number, number] => {
  const L = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
  const M = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3);
  const S = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3);
  const channel = (v: number) => clamp(~~(255 * linearToGamma(v)), 0, 255);
  return [
    channel(+4.0767245293 * L - 3.3072168827 * M + 0.2307590544 * S),
    channel(-1.2681437731 * L + 2.6093323231 * M - 0.341134429 * S),
    channel(-0.0041119885 * L - 0.7034763098 * M + 1.7068625689 * S),
  ];
};

const rgbToHex = ([r, g, b]: [number, number, number]) =>
  '#' + (b | (g << 8) | (r << 16) | (1 << 24)).toString(16).slice(1);

/** The original's `Lch(L, c, h)`: L, c in 0–100, h in degrees → clamped sRGB hex. */
const Lch = (L: number, c: number, h: number) => {
  const a = (h / 180) * Math.PI;
  c /= 100;
  L /= 100;
  return rgbToHex(oklabToRGB(L, c ? c * Math.cos(a) : 0, c ? c * Math.sin(a) : 0));
};

Random.setSeed('curve-relief');

interface LchColor {
  L: number;
  C: number;
  h: number;
}

const FILLS: LchColor[] = [
  { L: 50, C: 50, h: Random.range(180, 360) },
  { L: 100, C: 70, h: Random.range(0, 180) },
  { L: 100, C: 20, h: Random.range(0, 180) },
  { L: 20, C: 90, h: Random.range(0, 180) },
];
const lch = ({ L, C, h }: LchColor, hueOffset: number) => Lch(L, C, h + hueOffset);

// Seeded control points, as fractions of the original canvas (0.4–0.6 of the size)
const CONTROL_FRACTIONS: Pt[] = FILLS.map(() => ({
  x: Random.range(0.4, 0.6),
  y: Random.range(0.4, 0.6),
}));

// --- Physics -----------------------------------------------------------------------

interface Curve {
  color: LchColor;
  /** Control point of the seed quadratic, in world units (the handle). */
  control: Pt;
  bodies: Matter.Body[];
  /** Chain springs plus the two end springs — every constraint that follows the sliders. */
  springs: Matter.Constraint[];
  /** The rigid tie from the last node to the closing corner (stiffness 1, damping 1). */
  tie: Matter.Constraint;
}

// --- Sketch -------------------------------------------------------------------

export const sketch = ({ wrap, context, canvas, width, height, pixelRatio, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      Matter.Engine.clear(engine);
      Matter.Composite.clear(world, false);
      shell.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  /**
   * Restart the drop: rebuild every chain taut along its seed curve — the control
   * points stay where they were dragged — so the simulation replays from the
   * current settings. Runs once whenever a pointer interaction with the chrome
   * ends (the shell's `onDragEnd`), which covers slider drags, handle drags,
   * window drags and the reset button alike.
   */
  const restart = () => curves.forEach(rebuild);

  // Reset: a momentary toolbar button (appended after the magnifier via `tools`).
  // Releasing it ends a drag, which restarts the drop; here it only un-highlights.
  const resetGroup = createToggleGroup({
    items: [
      {
        id: 'reset',
        drawIcon: (ctx, rect, active) => drawFeather(ctx, rect, ROTATE_CCW, iconColors(active).fg),
      },
    ],
    exclusive: false,
    onChange: (active) => {
      if (active.includes('reset')) resetGroup.setActive('reset', false);
    },
  });

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    modes: [
      { id: 'dot', icon: 'dot' },
      { id: 'line', icon: 'line' },
    ],
    params: [
      { id: 'tightness', label: 'tightness', min: 0, max: 1, value: 0.5, step: 0.01, knobColor: '#8a5cf5' },
      { id: 'stiffness', label: 'stiffness', min: 0.01, max: 1, value: 0.5, step: 0.01, knobColor: '#e8541e' },
      { id: 'damping', label: 'damping', min: 0, max: 0.2, value: 0.05, step: 0.005, knobColor: '#111111' },
      { id: 'gravity', label: 'gravity', min: 0, max: 2, value: 1, step: 0.05, knobColor: '#111111' },
      { id: 'hue', label: 'hue', min: 0, max: 360, value: 0, step: 1, knobColor: '#8a5cf5' },
    ],
    // Five sliders: lift the panel so every one stays inside the frame
    panel: { y: height - 480 },
    loupe: {},
    tools: [resetGroup],
    // The control points are handles, visible and draggable only in `line` mode.
    // Dragging one rebuilds that curve's chain in place.
    handles: {
      points: () => (shell.mode === 'line' ? curves.map((c) => c.control) : []),
      onDrag: (i, p) => {
        curves[i].control = p;
        rebuild(curves[i]);
      },
      radius: 30,
      draw: (ctx, s) => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = HANDLE_FILL;
        ctx.fill();
      },
    },
    onChange: () => props.render(),
    onDragEnd: restart,
  });

  // The grid area's world rect at the fit view: 4 units across, inner.h / fitScale
  // tall (the ruler column makes it taller than wide). The original 1080 px canvas
  // is stretched over it so the reliefs span the whole area.
  const W = shell.camera.units;
  const H = shell.inner.h / shell.camera.fitScale;

  // The physics runs in the original's frame — pixel-like units (world × 270),
  // x rightward, y down — so the spring/gravity feel is preserved. World x grows
  // leftward (`xOrigin: 'right'`) and y upward, so both axes are mirrored.
  const SIM_W = W * SIM_SCALE;
  const SIM_H = H * SIM_SCALE;
  const toWorld = (s: Matter.Vector): Pt => ({ x: W - s.x / SIM_SCALE, y: H - s.y / SIM_SCALE });
  const toSim = (p: Pt): Matter.Vector => ({ x: (W - p.x) * SIM_SCALE, y: (H - p.y) * SIM_SCALE });

  // Anchors in sim units: the original's (width, 0), (0, height) and (0, 0)
  const START: Matter.Vector = { x: SIM_W, y: 0 };
  const END: Matter.Vector = { x: 0, y: SIM_H };
  const ORIGIN: Matter.Vector = { x: 0, y: 0 };

  const engine = Matter.Engine.create();
  const world = engine.world;

  const spring = () => ({
    stiffness: shell.params.value('stiffness'),
    damping: shell.params.value('damping'),
  });

  /** Build a curve's chain: nodes along the seed quadratic's LUT, springs between them and to the anchors. */
  const build = (control: Pt, color: LchColor): Curve => {
    const curve = Bezier.quadraticFromPoints(START, toSim(control), END, shell.params.value('tightness')).getLUT(STEPS);

    const bodies: Matter.Body[] = [];
    const springs: Matter.Constraint[] = [];
    for (const { x, y } of curve) {
      const body = Matter.Bodies.circle(x, y, NODE_RADIUS, { collisionFilter: { group: -1 } });
      if (bodies.length > 0) {
        springs.push(Matter.Constraint.create({ bodyA: bodies[bodies.length - 1], bodyB: body, ...spring() }));
      }
      bodies.push(body);
    }
    const last = bodies[bodies.length - 1];
    springs.push(Matter.Constraint.create({ pointA: START, bodyB: bodies[0], ...spring() }));
    springs.push(Matter.Constraint.create({ pointA: END, bodyB: last, ...spring() }));
    const tie = Matter.Constraint.create({ pointA: ORIGIN, bodyB: last, stiffness: 1, damping: 1 });

    Matter.Composite.add(world, [...bodies, ...springs, tie]);
    return { color, control, bodies, springs, tie };
  };

  /** Swap a curve's bodies and constraints for a fresh chain through its current control point. */
  const rebuild = (c: Curve) => {
    Matter.Composite.remove(world, [...c.bodies, ...c.springs, c.tie]);
    const fresh = build(c.control, c.color);
    c.bodies = fresh.bodies;
    c.springs = fresh.springs;
    c.tie = fresh.tie;
  };

  const curves: Curve[] = FILLS.map((color, i) => {
    const f = CONTROL_FRACTIONS[i];
    return build(toWorld({ x: f.x * SIM_W, y: f.y * SIM_H }), color);
  });

  // Keep the live simulation on the sliders after a restart: stiffness/damping
  // retune every spring, gravity scales the engine's pull. (Tightness only
  // matters at build time, and every change already rebuilds via `restart`.)
  let applied = { stiffness: NaN, damping: NaN, gravity: NaN };
  const applyParams = (params: Record<string, number>) => {
    const { stiffness, damping, gravity } = params;
    if (stiffness !== applied.stiffness || damping !== applied.damping) {
      for (const c of curves) {
        for (const s of c.springs) {
          s.stiffness = stiffness;
          s.damping = damping;
        }
      }
    }
    if (gravity !== applied.gravity) engine.gravity.y = gravity;
    applied = { stiffness, damping, gravity };
  };

  // Step by wall-clock time so a UI-triggered repaint mid-frame never double-steps
  let lastStep = performance.now();
  const step = () => {
    const now = performance.now();
    const dt = Math.min(now - lastStep, MAX_DT);
    lastStep = now;
    if (dt > 0) Matter.Engine.update(engine, dt);
  };

  // While the pointer holds any piece of chrome (a slider knob, a control-point
  // handle, a window, the reset button) the physics is frozen — the current state
  // keeps drawing — until the release restarts the drop from the final values.
  const tick = () => {
    if (shell.ui.dragging) lastStep = performance.now();
    else step();
  };

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      shell,
      camera: shell.camera,
      loupe: shell.loupe,
      engine,
      curves,
      resetGroup,
      /** Restart the drop programmatically (what releasing the reset button does). */
      reset: restart,
      repaint: () => props.render(),
    };
  }

  // --- Drawing ---------------------------------------------------------------------

  /**
   * One relief: from the start corner, the original's double quadratic through
   * each node pair (a smooth pass through the node, then on to the midpoint), to
   * the closing corner. Built in world space, filled in screen space.
   */
  const drawCurve = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView, c: Curve) => {
    const nodes = c.bodies.map((b) => toWorld(b.position));
    const start = toWorld(START);
    const origin = toWorld(ORIGIN);

    ctx.save();
    cam.apply(ctx);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.quadraticCurveTo(a.x, a.y, b.x, b.y);
    }
    ctx.lineTo(origin.x, origin.y);
    ctx.closePath();
    ctx.restore();

    const color = lch(c.color, view.params.hue);
    ctx.fillStyle = view.magnified ? shell.hatch(color) : color;
    ctx.fill();
  };

  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const k = view.magnification;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Back to front: the curve whose control point is furthest from the origin
    // corner is the largest relief and goes down first, like the original.
    const dist = (c: Curve) => {
      const s = toSim(c.control);
      return Math.hypot(s.x, s.y);
    };
    const ordered = [...curves].sort((c1, c2) => dist(c2) - dist(c1));
    for (const c of ordered) drawCurve(ctx, cam, view, c);

    if (view.mode === 'line') {
      // The chain nodes as small ink rings
      ctx.lineWidth = 1 * k;
      ctx.strokeStyle = theme.ink;
      for (const c of curves) {
        for (const b of c.bodies) {
          const s = cam.worldToScreen(toWorld(b.position));
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3 * k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Inside the loupe the handles are drawn magnified, on top of the reliefs;
      // outside, the shell's handle layer paints them above the scene.
      if (view.magnified) {
        for (const c of curves) {
          const s = cam.worldToScreen(c.control);
          ctx.beginPath();
          ctx.arc(s.x, s.y, HANDLE_RADIUS * k, 0, Math.PI * 2);
          ctx.fillStyle = HANDLE_FILL;
          ctx.fill();
        }
      }
    }
  };

  wrap.render = () => {
    applyParams(shell.params.values());
    tick();
    shell.render(drawScene);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);

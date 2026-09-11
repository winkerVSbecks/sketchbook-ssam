import { createCamera, type Camera } from './camera';
import { clientToLogical, type PointerMods } from './pointer';
import type { UIWindow } from './ui';
import { clamp, labelFont, theme, type Cursor, type Pt, type Rect } from './types';

export interface LoupeInfo {
  magnification: number;
  /** Radius of the visible content disc (inside the rim), screen px. */
  radius: number;
  /** Lens centre in screen coordinates. */
  center: Pt;
}

export interface LoupeOptions {
  /** The main camera the lens magnifies. */
  camera: Camera;
  /** Sketch [width, height]; the lens radius is `radiusFactor × min(width, height)`. */
  size: [number, number];
  /** Initial radius as a fraction of min(width, height). */
  radiusFactor?: number;
  /** Shift+drag resize limits, as fractions of min(width, height). */
  minRadiusFactor?: number;
  maxRadiusFactor?: number;
  magnification?: number;
  /** Magnification steps for click / shift-click; also the clamp range. */
  steps?: number[];
  /** Draw the magnified content. `ctx` is clipped to the lens disc; draw in screen space or under `lens.apply`. */
  render: (ctx: CanvasRenderingContext2D, lens: Camera, info: LoupeInfo) => void;
  /** Screen area the lens must stay within; defaults to the camera viewport. */
  area?: Rect;
  paper?: string;
  ink?: string;
}

export interface Loupe extends UIWindow {
  /** Outer radius (rim included), screen px. Shift+drag inside the lens resizes it. */
  readonly radius: number;
  setRadius(px: number): boolean;
  readonly magnification: number;
  /** Lens centre as a world point, or null when hidden. */
  readonly center: Pt | null;
  screenCenter(): Pt | null;
  /** Show the lens centred at a screen point (clamped inside `area`). */
  placeAt(pt: Pt): boolean;
  hide(): boolean;
  stepMagnification(dir: 1 | -1): boolean;
  setMagnification(k: number): boolean;
  /** A camera looking at the lens centre with `magnification × camera.scale`. */
  lensCamera(): Camera;
  /** ctrl+wheel over the lens adjusts magnification. Returns dispose. */
  attachWheel(canvas: HTMLCanvasElement, getSize: () => [number, number], onChange?: () => void): () => void;
}

export function createLoupe({
  camera,
  size,
  radiusFactor = 0.22,
  minRadiusFactor = 0.08,
  maxRadiusFactor = 0.45,
  magnification = 2,
  steps = [2, 4, 8],
  render,
  area = camera.viewport,
  paper = theme.paper,
  ink = theme.ink,
}: LoupeOptions): Loupe {
  const minSide = Math.min(size[0], size[1]);
  const rMin = minRadiusFactor * minSide;
  const rMax = maxRadiusFactor * minSide;
  let radius = clamp(radiusFactor * minSide, rMin, rMax);
  const rimOf = (r: number) => Math.max(10, r * 0.06);
  let rim = rimOf(radius);
  let innerR = radius - rim;
  const kMin = Math.min(...steps);
  const kMax = Math.max(...steps);

  let k = clamp(magnification, kMin, kMax);
  let centerWorld: Pt | null = null;
  let drag: { start: Pt; origin: Pt; moved: boolean; resize: boolean; r0: number; d0: number } | null = null;

  const clampScreen = (p: Pt): Pt => ({
    x: area.w <= radius * 2 ? area.x + area.w / 2 : clamp(p.x, area.x + radius, area.x + area.w - radius),
    y: area.h <= radius * 2 ? area.y + area.h / 2 : clamp(p.y, area.y + radius, area.y + area.h - radius),
  });

  const screenCenter = (): Pt | null => (centerWorld ? camera.worldToScreen(centerWorld) : null);

  const setCenterScreen = (p: Pt): boolean => {
    const c = clampScreen(p);
    const w = camera.screenToWorld(c);
    if (centerWorld && centerWorld.x === w.x && centerWorld.y === w.y) return false;
    centerWorld = w;
    return true;
  };

  const contains = (pt: Pt) => {
    const c = screenCenter();
    if (!c) return false;
    return Math.hypot(pt.x - c.x, pt.y - c.y) <= radius;
  };

  const setRadius = (px: number): boolean => {
    const r = clamp(px, rMin, rMax);
    if (r === radius) return false;
    radius = r;
    rim = rimOf(radius);
    innerR = radius - rim;
    // Keep the lens inside the area now that it's a different size
    const sc = screenCenter();
    if (sc) centerWorld = camera.screenToWorld(clampScreen(sc));
    return true;
  };

  const setMagnification = (next: number): boolean => {
    const v = clamp(next, kMin, kMax);
    if (v === k) return false;
    k = v;
    return true;
  };

  const lensCamera = (): Camera => {
    const c = screenCenter() ?? { x: area.x + area.w / 2, y: area.y + area.h / 2 };
    const lens = createCamera({
      viewport: { x: c.x - innerR, y: c.y - innerR, w: innerR * 2, h: innerR * 2 },
      units: (innerR * 2) / (camera.scale * k),
      flipX: camera.flipX,
      flipY: camera.flipY,
    });
    if (centerWorld) lens.lookAt(centerWorld);
    return lens;
  };

  const loupe: Loupe = {
    visible: false,
    stayBehind: true,
    get radius() {
      return radius;
    },
    setRadius,
    get magnification() {
      return k;
    },
    get center() {
      return centerWorld ? { ...centerWorld } : null;
    },
    screenCenter,
    placeAt: (pt) => {
      const moved = setCenterScreen(pt);
      const shown = !loupe.visible;
      loupe.visible = true;
      return moved || shown;
    },
    hide: () => {
      if (!loupe.visible) return false;
      loupe.visible = false;
      drag = null;
      return true;
    },
    stepMagnification: (dir) => {
      const sorted = [...steps].sort((a, b) => a - b);
      let i = sorted.findIndex((s) => s >= k - 1e-9);
      if (i < 0) i = 0;
      const next = sorted[(i + dir + sorted.length) % sorted.length];
      return setMagnification(next);
    },
    setMagnification,
    lensCamera,
    contains: (pt) => loupe.visible && contains(pt),
    draw: (ctx) => draw(ctx),
    pointerDown: (pt, mods) => {
      if (!loupe.visible || !contains(pt)) return false;
      const c = screenCenter()!;
      drag = {
        start: pt,
        origin: c,
        moved: false,
        resize: !!mods?.shiftKey,
        r0: radius,
        d0: Math.hypot(pt.x - c.x, pt.y - c.y),
      };
      return false;
    },
    pointerMove: (pt) => {
      if (!drag) return false;
      if (Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) > 3) drag.moved = true;
      if (!drag.moved) return false;
      if (drag.resize) {
        // Shift+drag: grow/shrink by how much the pointer moved away from / towards the centre
        const d = Math.hypot(pt.x - drag.origin.x, pt.y - drag.origin.y);
        return setRadius(drag.r0 + (d - drag.d0));
      }
      return setCenterScreen({ x: drag.origin.x + (pt.x - drag.start.x), y: drag.origin.y + (pt.y - drag.start.y) });
    },
    pointerUp: (_pt, mods?: PointerMods) => {
      const d = drag;
      drag = null;
      if (!d) return false;
      if (d.moved) return false;
      return loupe.stepMagnification(mods?.shiftKey ? -1 : 1);
    },
    cursorAt: (pt): Cursor | null => {
      if (drag) return drag.resize ? 'crosshair' : 'grabbing';
      return loupe.visible && contains(pt) ? 'grab' : null;
    },
    attachWheel: (canvas, getSize, onChange) => {
      const onWheel = (e: WheelEvent) => {
        const pt = clientToLogical(canvas, e, getSize);
        if (!loupe.visible || !contains(pt)) return;
        e.preventDefault();
        if (!e.ctrlKey) return;
        const dz = clamp(e.deltaY, -100, 100);
        if (setMagnification(k * Math.exp(-dz * 0.005))) onChange?.();
      };
      canvas.addEventListener('wheel', onWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', onWheel);
    },
  };

  function draw(ctx: CanvasRenderingContext2D) {
    if (!loupe.visible) return;
    const c = screenCenter();
    if (!c) return;
    const lens = lensCamera();

    // Shadow under the whole lens
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.restore();

    // Magnified content, clipped to the disc inside the rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, innerR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = paper;
    ctx.fillRect(c.x - innerR, c.y - innerR, innerR * 2, innerR * 2);
    render(ctx, lens, { magnification: k, radius: innerR, center: c });
    ctx.restore();

    // Rim: white band with ink lines on both edges
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.arc(c.x, c.y, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = paper;
    ctx.fill('evenodd');
    ctx.strokeStyle = ink;
    ctx.lineWidth = theme.border;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius - theme.border / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, innerR, 0, Math.PI * 2);
    ctx.stroke();

    // Tick ring just inside the inner edge: short every 2°, long every 10°
    ctx.lineWidth = 1;
    ctx.beginPath();
    const longT = rim * 0.9;
    const shortT = rim * 0.45;
    for (let deg = 0; deg < 360; deg += 2) {
      const a = (deg * Math.PI) / 180;
      const len = deg % 10 === 0 ? longT : shortT;
      const r0 = innerR - 1;
      ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
      ctx.lineTo(c.x + Math.cos(a) * (r0 - len), c.y + Math.sin(a) * (r0 - len));
    }
    ctx.stroke();

    // ×k label on the rim, bottom centre
    const label = `×${Number.isInteger(k) ? k : k.toFixed(1)}`;
    ctx.font = labelFont(Math.max(9, rim * 0.7), 500);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = paper;
    ctx.fillRect(c.x - w / 2, c.y + radius - rim - 2, w, rim + 2);
    ctx.fillStyle = ink;
    ctx.fillText(label, c.x, c.y + radius - rim / 2 - 1);
    ctx.restore();
  }

  return loupe;
}

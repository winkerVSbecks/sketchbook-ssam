import { mapRange } from 'canvas-sketch-util/math';
import { applyNoise } from '../../noise-texture';

export interface Point {
  x: number;
  y: number;
}

export interface ShadeColors {
  light: string;
  base: string;
  dark: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(mapRange(t, 0, 1, ar, br));
  const g = Math.round(mapRange(t, 0, 1, ag, bg));
  const bl = Math.round(mapRange(t, 0, 1, ab, bb));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

export function strokePathThrough(
  context: CanvasRenderingContext2D,
  points: Point[],
) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    context.lineTo(points[i].x, points[i].y);
  }
}

export const DEFAULT_LINE_LIGHT_ANGLE = -Math.PI * 0.72;

// Lit neon tube in two parts: an outer atmospheric bloom that bleeds into
// the background, then a cylindrical cross-section — concentric solid
// bands from a dark rim down to a light tint — so the tube shows real
// layers rather than one hue fading through alpha. The hot core is nudged
// toward a fixed light direction rather than centered, which is what
// makes the tube read as lit instead of merely glowing evenly all around.
export function drawGlowLine(
  context: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  lineWidth: number,
  lightAngle: number = DEFAULT_LINE_LIGHT_ANGLE,
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const bloom = [
    { blur: 30, width: lineWidth * 4.0, alpha: 0.06, composite: 'screen' as GlobalCompositeOperation },
    { blur: 20, width: lineWidth * 2.9, alpha: 0.11, composite: 'screen' as GlobalCompositeOperation },
    { blur: 11, width: lineWidth * 2.0, alpha: 0.18, composite: 'lighter' as GlobalCompositeOperation },
  ];
  for (const layer of bloom) {
    context.globalCompositeOperation = layer.composite;
    context.filter = `blur(${layer.blur}px)`;
    context.strokeStyle = rgba(color, layer.alpha);
    context.lineWidth = layer.width;
    strokePathThrough(context, points);
    context.stroke();
  }

  context.globalCompositeOperation = 'source-over';
  context.filter = 'blur(1px)';
  const bands: [number, string][] = [
    [1.0, mixHex(color, '#000000', 0.6)],
    [0.76, color],
    [0.5, mixHex(color, '#ffffff', 0.4)],
  ];
  for (const [widthMul, bandColor] of bands) {
    context.strokeStyle = bandColor;
    context.lineWidth = lineWidth * widthMul;
    strokePathThrough(context, points);
    context.stroke();
  }

  const lightDx = Math.cos(lightAngle) * lineWidth * 0.16;
  const lightDy = Math.sin(lightAngle) * lineWidth * 0.16;
  const litPoints = points.map((p) => ({ x: p.x + lightDx, y: p.y + lightDy }));

  context.filter = 'none';
  context.strokeStyle = rgba(mixHex(color, '#ffffff', 0.55), 0.9);
  context.lineWidth = lineWidth * 0.3;
  strokePathThrough(context, litPoints);
  context.stroke();

  context.strokeStyle = mixHex(color, '#ffffff', 0.9);
  context.lineWidth = lineWidth * 0.12;
  strokePathThrough(context, litPoints);
  context.stroke();

  context.restore();
}

// Rounded polygon via arcTo-style corner cutting (quadraticCurveTo), works
// for convex and reflex (concave) vertices alike as long as radius doesn't
// exceed half the shortest adjacent edge — used for the plus/cross motif.
export function roundedPolygonPath(points: Point[], radius: number): Path2D {
  const path = new Path2D();
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    let v1x = prev.x - curr.x;
    let v1y = prev.y - curr.y;
    let v2x = next.x - curr.x;
    let v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    v1x /= len1;
    v1y /= len1;
    v2x /= len2;
    v2y /= len2;

    const r = Math.min(radius, len1 / 2, len2 / 2);
    const before = { x: curr.x + v1x * r, y: curr.y + v1y * r };
    const after = { x: curr.x + v2x * r, y: curr.y + v2y * r };

    if (i === 0) path.moveTo(before.x, before.y);
    else path.lineTo(before.x, before.y);
    path.quadraticCurveTo(curr.x, curr.y, after.x, after.y);
  }
  path.closePath();
  return path;
}

// Cylindrical/toon shading for a filled shape: a linear gradient across
// the shape's bounds, light on one side and dark on the other, standing
// in for light hitting a rounded plastic surface.
export function shadeFillPath(
  context: CanvasRenderingContext2D,
  path: Path2D,
  bounds: { x: number; y: number; w: number; h: number },
  colors: ShadeColors,
  lightAngle: number,
) {
  const lx = bounds.x + bounds.w / 2 + Math.cos(lightAngle) * bounds.w * 0.6;
  const ly = bounds.y + bounds.h / 2 + Math.sin(lightAngle) * bounds.h * 0.6;
  const dx = bounds.x + bounds.w / 2 - Math.cos(lightAngle) * bounds.w * 0.6;
  const dy = bounds.y + bounds.h / 2 - Math.sin(lightAngle) * bounds.h * 0.6;

  const gradient = context.createLinearGradient(lx, ly, dx, dy);
  gradient.addColorStop(0, colors.light);
  gradient.addColorStop(0.55, colors.base);
  gradient.addColorStop(1, colors.dark);

  context.fillStyle = gradient;
  context.fill(path);
}

export function drawSpecularHighlight(
  context: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  radius: number,
  clipPath?: Path2D,
) {
  context.save();
  if (clipPath) context.clip(clipPath);
  const gradient = context.createRadialGradient(hx, hy, 0, hx, hy, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(hx, hy, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function drawVignetteBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: string,
  vignetteStrength: number,
) {
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    width * 0.2,
    width / 2,
    height / 2,
    width * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, `rgba(0, 0, 0, ${vignetteStrength})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

// Whole-frame film grain — the illustrated feel comes from dense noise
// running through the glow and gradients, not sitting on top of them, so
// callers should run this last, after everything else is drawn. Reads
// context.canvas.width/height (the physical pixel size) rather than the
// logical width/height ssam sketches draw with, since the context is
// scaled for devicePixelRatio and getImageData ignores that scale.
export function applyFilmGrain(
  context: CanvasRenderingContext2D,
  intensity: number,
) {
  const grained = applyNoise(
    context,
    context.canvas.width,
    context.canvas.height,
    intensity,
    'grayscale',
  );
  context.putImageData(grained, 0, 0);
}

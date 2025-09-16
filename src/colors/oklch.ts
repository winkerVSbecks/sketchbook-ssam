import Random from 'canvas-sketch-util/random';
import { colorHarmonies, colorHarmony } from './utils';

export function kellyInspiredScheme(): string[] {
  const baseHue = Random.rangeFloor(0, 360);
  const colors = [];

  // Background (Kelly's "ground")
  const bgL = Random.range(0.85, 0.95); // Oklch lightness (0-1)
  const bgC = Random.range(0.02, 0.06); // Oklch chroma (very subtle)
  const bgH = baseHue;
  colors.push(`oklch(${(bgL * 100).toFixed(1)}% ${bgC} ${bgH})`);

  // Mid-tone (transitional)
  const midL = bgL - Random.range(0.05, 0.1);
  const midC = bgC + Random.range(0.01, 0.02);
  const midH = baseHue;
  colors.push(`oklch(${(midL * 100).toFixed(1)}% ${midC} ${midH})`);

  // Accent (Kelly's "figure") - more vibrant
  const accentL = Random.range(0.45, 0.6);
  const accentC = Random.range(0.3, 0.8); // More vibrant
  const accentH = baseHue + Random.range(-20, 20);
  colors.push(`oklch(${(accentL * 100).toFixed(1)}% ${accentC} ${accentH})`);

  return colors;
}

export function splitComplementary(): string[] {
  const colors = [];

  const [baseHue, splitHue1, splitHue2] = colorHarmonies.splitComplementary(
    Random.rangeFloor(0, 360)
  );

  // Background (Kelly's "ground")
  const bgL = Random.range(0.85, 0.95); // Oklch lightness (0-1)
  const bgC = Random.range(0.02, 0.06); // Oklch chroma (very subtle)
  const bgH = splitHue1;
  colors.push(`oklch(${(bgL * 100).toFixed(1)}% ${bgC} ${bgH})`);

  // Mid-tone (transitional)
  const midL = bgL - Random.range(0.05, 0.1);
  const midH = splitHue2;
  colors.push(`oklch(${(midL * 100).toFixed(1)}% ${bgC} ${midH})`);

  // Accent (Kelly's "figure") - more vibrant
  const accentL = Random.range(0.45, 0.6);
  const accentC = Random.range(0.3, 0.8); // More vibrant
  const accentH = baseHue;
  colors.push(`oklch(${(accentL * 100).toFixed(1)}% ${accentC} ${accentH})`);

  return colors;
}

export function complementary(): string[] {
  const colors = [];

  const [baseHue, complementaryHue] = colorHarmonies.complementary(
    Random.rangeFloor(0, 360)
  );

  // Background (Kelly's "ground")
  const bgL = Random.range(0.85, 0.95); // Oklch lightness (0-1)
  const bgC = Random.range(0.02, 0.06); // Oklch chroma (very subtle)
  const bgH = complementaryHue;
  colors.push(`oklch(${(bgL * 100).toFixed(1)}% ${bgC} ${bgH})`);

  // Mid-tone (transitional)
  const midL = bgL - Random.range(0.05, 0.1);
  const midH = complementaryHue;
  colors.push(`oklch(${(midL * 100).toFixed(1)}% ${bgC} ${midH})`);

  // Accent (Kelly's "figure") - more vibrant
  const accentL = Random.range(0.45, 0.6);
  const accentC = Random.range(0.3, 0.8); // More vibrant
  const accentH = baseHue;
  colors.push(`oklch(${(accentL * 100).toFixed(1)}% ${accentC} ${accentH})`);

  return colors;
}

export function triadic(): string[] {
  const colors = [];

  const [baseHue, splitHue1, splitHue2] = colorHarmonies.triadic(
    Random.rangeFloor(0, 360)
  );

  // Background (Kelly's "ground")
  const bgL = Random.range(0.85, 0.95); // Oklch lightness (0-1)
  const bgC = Random.range(0.02, 0.06); // Oklch chroma (very subtle)
  const bgH = splitHue1;
  colors.push(`oklch(${(bgL * 100).toFixed(1)}% ${bgC} ${bgH})`);

  // Mid-tone (transitional)
  const midL = bgL - Random.range(0.05, 0.1);
  const midH = splitHue2;
  colors.push(`oklch(${(midL * 100).toFixed(1)}% ${bgC} ${midH})`);

  // Accent (Kelly's "figure") - more vibrant
  const accentL = Random.range(0.45, 0.6);
  const accentC = Random.range(0.3, 0.8); // More vibrant
  const accentH = baseHue;
  colors.push(`oklch(${(accentL * 100).toFixed(1)}% ${accentC} ${accentH})`);

  return colors;
}

export function superSaturated(): string[] {
  const colors = [];

  const [baseHue, complementaryHue] = colorHarmonies.complementary(
    Random.pick([60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360])
    // Random.rangeFloor(0, 360)
  );
  const chroma = Random.range(0.3, 0.8);

  // Background (Kelly's "ground")
  const bgL = Random.range(0.85, 0.95); // Oklch lightness (0-1)
  const bgH = baseHue;
  colors.push(`oklch(${(bgL * 100).toFixed(1)}% ${chroma - 0.2} ${bgH})`);

  // Mid-tone (transitional)
  const midL = bgL - Random.range(0.05, 0.1);
  const midH = baseHue;
  colors.push(`oklch(${(midL * 100).toFixed(1)}% ${chroma - 0.2} ${midH})`);

  // Accent (Kelly's "figure") - more vibrant
  const accentL = Random.range(0.45, 0.6);
  const accentH = complementaryHue;
  colors.push(`oklch(${(accentL * 100).toFixed(1)}% ${chroma} ${accentH})`);

  return colors;
}

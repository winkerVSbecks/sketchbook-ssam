import { wrap } from 'canvas-sketch-util/math';

export function normalizeHue(hue: number): number {
  return wrap(hue, 0, 360);
}

export const colorHarmonies = {
  complementary: (h: number) => [normalizeHue(h), normalizeHue(h + 180)],
  splitComplementary: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 150),
    normalizeHue(h - 150),
  ],
  triadic: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 120),
    normalizeHue(h + 240),
  ],
  tetradic: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 90),
    normalizeHue(h + 180),
    normalizeHue(h + 270),
  ],
  pentadic: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 72),
    normalizeHue(h + 144),
    normalizeHue(h + 216),
    normalizeHue(h + 288),
  ],
  hexadic: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 60),
    normalizeHue(h + 120),
    normalizeHue(h + 180),
    normalizeHue(h + 240),
    normalizeHue(h + 300),
  ],
  monochromatic: (h: number) => [normalizeHue(h), normalizeHue(h)],
  doubleComplementary: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 180),
    normalizeHue(h + 30),
    normalizeHue(h + 210),
  ],
  compound: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 180),
    normalizeHue(h + 60),
    normalizeHue(h + 240),
  ],
  analogous: (h: number) => [
    normalizeHue(h),
    normalizeHue(h + 30),
    normalizeHue(h + 60),
    normalizeHue(h + 90),
    normalizeHue(h + 120),
    normalizeHue(h + 150),
  ],
};

export type colorHarmony = keyof typeof colorHarmonies;

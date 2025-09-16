import { Hsluv } from 'hsluv';
import Random from 'canvas-sketch-util/random';

export function randomThreeHueScheme(): string[] {
  const startHue = Random.rangeFloor(0, 360);
  const startSat = Random.rangeFloor(40, 100);
  const startLig = Random.rangeFloor(0, 60);

  // How much should each color change?

  const changeHue = Random.rangeFloor(10, 120);
  const changeSat = Random.rangeFloor(15, 40);
  const changeLig = Random.rangeFloor(15, 40);

  const colors = [];
  for (let i = 0; i < 3; i++) {
    const color = new Hsluv();
    color.hsluv_h = Math.min(startHue + i * changeHue, 360);
    color.hsluv_s = Math.min(startSat + i * changeSat, 100);
    color.hsluv_l = Math.min(startLig + i * changeLig, 100);
    color.hsluvToHex();

    colors.push(color.hex);
  }

  return colors;
}

export function threeHueHighContrastScheme(): string[] {
  const startHue = Random.rangeFloor(0, 360);
  const startSat = Random.rangeFloor(40, 100);
  const startLig = Random.rangeFloor(0, 60);

  const colors = [];

  const c1 = new Hsluv();
  c1.hsluv_h = startHue;
  c1.hsluv_s = 20;
  c1.hsluv_l = Random.rangeFloor(80, 100);
  c1.hsluvToHex();
  colors.push(c1.hex);

  const c2 = new Hsluv();
  c2.hsluv_h = startHue;
  c2.hsluv_s = c1.hsluv_s;
  c2.hsluv_l = Math.max(0, c1.hsluv_l - Random.rangeFloor(5, 10));
  c2.hsluvToHex();
  colors.push(c2.hex);

  const c3 = new Hsluv();
  c3.hsluv_h = startHue;
  c3.hsluv_s = Math.min(startSat + Random.rangeFloor(40, 60), 100);
  c3.hsluv_l = startLig;
  c3.hsluvToHex();
  colors.push(c3.hex);

  return colors;
}

export function kellyInspiredScheme(): string[] {
  const baseHue = Random.rangeFloor(0, 360);
  const colors = [];

  // Background (Kelly's "ground")
  const bg = new Hsluv();
  bg.hsluv_h = baseHue;
  bg.hsluv_s = Random.rangeFloor(8, 15); // Very subtle
  bg.hsluv_l = Random.rangeFloor(85, 95);
  bg.hsluvToHex();
  colors.push(bg.hex);

  // Mid-tone (transitional)
  const mid = new Hsluv();
  mid.hsluv_h = baseHue;
  mid.hsluv_s = Random.rangeFloor(15, 25);
  mid.hsluv_l = Random.rangeFloor(bg.hsluv_l - 5, bg.hsluv_l - 10);
  mid.hsluvToHex();
  colors.push(mid.hex);

  // Accent (Kelly's "figure")
  const accent = new Hsluv();
  accent.hsluv_h = baseHue + Random.rangeFloor(-20, 20); // Slight hue shift
  accent.hsluv_s = Random.rangeFloor(60, 85); // High saturation
  accent.hsluv_l = Random.rangeFloor(25, 45); // Dark enough for contrast
  accent.hsluvToHex();
  colors.push(accent.hex);

  return colors;
}

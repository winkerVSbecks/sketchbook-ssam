import { clrs } from './clrs';
import { palettes as aaPalettes } from './auto-albers';
import { palettes as mPalettes } from './mindful-palettes';
import Random from 'canvas-sketch-util/random';

export function randomPalette(): string[] {
  const palettes = [...clrs, ...aaPalettes, ...mPalettes];
  return Random.pick(palettes);
}

export function logColors(colors: string[], skipName = false) {
  console.log(
    colors.map((color) => `%c ${skipName ? 'color' : color}`).join(' '),
    ...colors.map((color) => `background: ${color}; color: ${color}`)
  );
}

export function logColor(color: string) {
  console.log(`%c ${color}`, `background: ${color}; color: ${color}`);
}

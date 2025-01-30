import { clrs } from './clrs';
import { palettes as aaPalettes } from './auto-albers';
import { palettes as mPalettes } from './mindful-palettes';
import Random from 'canvas-sketch-util/random';

export function randomPalette(): string[] {
  const palettes = [...clrs, ...aaPalettes, ...mPalettes];
  return Random.pick(palettes);
}

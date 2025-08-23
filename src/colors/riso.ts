import riso from 'riso-colors';
import paper from 'paper-colors';
import Color from 'canvas-sketch-util/color';
import Random from 'canvas-sketch-util/random';

const risoColors = riso.map((h) => h.hex);
const paperColors = paper.map((h) => h.hex);

export function randomPalette(minContrast = 3) {
  const background = Random.pick(paperColors);

  const inkColors = risoColors
    .filter((color) => Color.contrastRatio(background, color) >= minContrast)
    .filter((c) => c !== '#000000');

  const ink = () => Random.pick(inkColors);

  return {
    bg: background,
    paper: () => Random.pick(paperColors),
    ink,
    inkColors,
  };
}

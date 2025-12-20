import { rybHsl2rgb } from 'rybitten';
import { cubes, ColorCoords } from 'rybitten/cubes';
import Random from 'canvas-sketch-util/random';

const gamuts = [
  'itten',
  'itten-normalized',
  'itten-neutral',
  'bezold',
  'boutet',
  'hett',
  'schiffermueller',
  'harris',
  'harrisc82',
  'harrisc82alt',
  'goethe',
  'munsell',
  'munsell-alt',
  'hayter',
  'bormann',
  'albers',
  'lohse',
  'chevreul',
  'runge',
  'maycock',
  'colorprinter',
  'japschool',
  'kindergarten1890',
  'marvel-news',
  'apple90s',
  'apple80s',
  'clayton',
  'pixelart',
  'ippsketch',
  'ryan',
  'ten',
  'rgb',
];
const gamut = cubes.get(Random.pick(gamuts))!;

const formatCSS = (rgb: ColorCoords): string => {
  return `rgb(${Math.round(rgb[0] * 255)} ${Math.round(
    rgb[1] * 255
  )} ${Math.round(rgb[2] * 255)})`;
};

export function createPalette(coords: ColorCoords[]) {
  return coords.map((coord) =>
    formatCSS(rybHsl2rgb(coord, { cube: gamut.cube }))
  );
}

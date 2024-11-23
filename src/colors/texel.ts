import * as Color from '@texel/color';

const VALID_GAMUTS = [
  Color.sRGBGamut,
  Color.DisplayP3Gamut,
  Color.A98RGBGamut,
  Color.Rec2020Gamut,
];
type ValidGamut =
  | typeof Color.sRGBGamut
  | typeof Color.DisplayP3Gamut
  | typeof Color.A98RGBGamut
  | typeof Color.Rec2020Gamut;

const VALID_SPACES = [Color.XYZ, Color.OKLab, Color.OKLCH];
type ValidSpace = typeof Color.XYZ | typeof Color.OKLab | typeof Color.OKLCH;

const K1 = 0.206;
const K2 = 0.03;
const K3 = (1.0 + K1) / (1.0 + K2);

// For the inverse, but not needed here
// const LToLr = (x) =>
//   0.5 *
//   (K3 * x - K1 + Math.sqrt((K3 * x - K1) * (K3 * x - K1) + 4 * K2 * K3 * x));

const LrToL = (x) => (x ** 2 + K1 * x) / (K3 * (x + K2));

const MAX_CHROMA = 0.225; // max chroma for all colors across all spaces

// All color coordinates are denoted in LrH[C] where C defaults to MAX_CHROMA
const BLACK = [0, 0, 0];
const WHITE = [1, 0, 0];
const GRAY = [0.65, 0, 0];
const COLOR_TONES = [
  BLACK, // black
  WHITE, // white
  GRAY, // gray
  [0.5, 30], // red
  [0.68, 55], // orange
  [0.465, 60], // brown
  [0.85, 95], // yellow
  [0.55, 145], // green
  [0.7, 175], // teal
  [0.3, 220], // dark blue
  [0.55, 255], // light blue
  [0.4, 270], // indigo
  [0.4, 310], // purple
  [0.85, 325], // light pink
  [0.75, 345], // hot pink
];

const PAPER_BACKGROUND = [0.9, 85, 0.02];
const BW_BACKGROUND = BLACK;
const BW_TONES = [BLACK, WHITE, GRAY];

export type System = 0 | 1;
export type ColorSpace =
  | 'xyz'
  | 'oklab'
  | 'oklch'
  | 'srgb'
  | 'display-p3'
  | 'a98-rgb'
  | 'rec2020';

export function getPalette({
  system = 0,
  colorSpace = 'srgb',
  serialize = true,
}: {
  system?: System;
  colorSpace: ColorSpace;
  serialize?: boolean;
}) {
  const colors = [];
  let gamut = null;
  let space = null;

  const foundGamut = VALID_GAMUTS.find((f) => f.space.id == colorSpace);
  if (foundGamut) {
    gamut = foundGamut;
    space = gamut.space;
  } else {
    space = VALID_SPACES.find((f) => f.id == colorSpace);
  }

  if (!space) throw new Error('invalid colorSpace');

  const bg = system == 0 ? PAPER_BACKGROUND : BW_BACKGROUND;
  const tones = system == 0 ? COLOR_TONES : BW_TONES;
  const interval = tones.length;
  colors.push(toColor(bg, gamut, space, serialize));
  for (let i = 0; i < 15; i++) {
    colors.push(toColor(tones[i % interval], gamut, space, serialize));
  }
  return colors;
}

function toColor(
  coords: number[],
  gamut: ValidGamut,
  space: ValidSpace,
  serialize: boolean
) {
  const [Lr, H, C = MAX_CHROMA] = coords;
  const L = LrToL(Lr);
  const oklch = [L, C, H];
  let outCoords;
  if (gamut) {
    outCoords = Color.gamutMapOKLCH(
      oklch,
      gamut,
      space,
      undefined,
      Color.MapToL
    );
  } else {
    outCoords = Color.convert(oklch, Color.OKLCH, space);
  }
  if (serialize) {
    return space.id === 'srgb'
      ? Color.RGBToHex(outCoords)
      : Color.serialize(outCoords, space);
  } else {
    return outCoords;
  }
}

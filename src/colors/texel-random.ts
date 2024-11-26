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

function randomTone(chroma = MAX_CHROMA) {
  return [
    Math.random(),
    Math.random() * 360,
    chroma || Math.random() * MAX_CHROMA,
  ];
}

// Add these utility functions
function calculateContrast(color1: number[], color2: number[]) {
  // Convert both colors to OKLab for better perceptual contrast calculation
  const lab1 = Color.convert(color1, Color.OKLCH, Color.OKLab);
  const lab2 = Color.convert(color2, Color.OKLCH, Color.OKLab);

  // Calculate simple perceptual distance
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];

  return Math.sqrt(dL * dL + da * da + db * db);
}
type ColorHarmony =
  | 'complementary'
  | 'triadic'
  | 'tetradic'
  | 'analogous'
  | 'split-complementary';

function generateHarmonicTones(
  baseHue: number,
  harmony: ColorHarmony = 'tetradic'
) {
  const tones: number[][] = [];

  // Reduced number of variations but more distinct hues
  const lightnesses = [0.35, 0.5, 0.65, 0.8]; // Fewer lightness steps
  const chromas = [MAX_CHROMA * 0.4, MAX_CHROMA * 0.7]; // More chromatic variation

  // Helper to add hue with variations
  const addHue = (hue: number, weight = 1) => {
    const variations = generateVariations(
      hue,
      lightnesses.slice(0, weight * 2 + 1), // More variations for primary hues
      chromas
    );
    tones.push(...variations);
  };

  switch (harmony) {
    case 'complementary':
      addHue(baseHue, 2); // More variations of base hue
      addHue((baseHue + 180) % 360, 2); // More variations of complement
      break;

    case 'triadic':
      addHue(baseHue, 2);
      addHue((baseHue + 120) % 360);
      addHue((baseHue + 240) % 360);
      break;

    case 'tetradic':
      // Square arrangement
      addHue(baseHue);
      addHue((baseHue + 90) % 360);
      addHue((baseHue + 180) % 360);
      addHue((baseHue + 270) % 360);
      break;

    case 'analogous':
      // Wider spread for analogous colors
      addHue(baseHue, 2);
      addHue((baseHue + 40) % 360);
      addHue((baseHue - 40 + 360) % 360);
      addHue((baseHue + 80) % 360);
      addHue((baseHue - 80 + 360) % 360);
      break;

    case 'split-complementary':
      addHue(baseHue, 2);
      addHue((baseHue + 150) % 360);
      addHue((baseHue + 210) % 360);
      break;
  }

  // Shuffle the array before taking 15 colors to get a more random selection
  // of variations while maintaining the harmony
  const shuffled = tones.sort(() => Math.random() - 0.5);

  // Then sort by hue for the final arrangement
  return shuffled.slice(0, 15).sort((a, b) => a[1] - b[1]);
}

function generateVariations(
  hue: number,
  lightnesses: number[],
  chromas: number[]
) {
  const variations: number[][] = [];

  for (const lr of lightnesses) {
    for (const c of chromas) {
      variations.push([lr, hue, c]);
    }
  }

  return variations;
}

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
const COLOR_TONES = Array.from({ length: 15 }, () =>
  randomTone(MAX_CHROMA * 0.5)
).sort((a, b) => a[1] - b[1]);
// const COLOR_TONES = [
//   BLACK, // black
//   WHITE, // white
//   GRAY, // gray
//   [0.5, 30], // red
//   [0.68, 55], // orange
//   [0.465, 60], // brown
//   [0.85, 95], // yellow
//   [0.55, 145], // green
//   [0.7, 175], // teal
//   [0.3, 220], // dark blue
//   [0.55, 255], // light blue
//   [0.4, 270], // indigo
//   [0.4, 310], // purple
//   [0.85, 325], // light pink
//   [0.75, 345], // hot pink
// ];

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

  // Generate background with random hue but controlled lightness
  const bg = [
    Math.random() > 0.5 ? 0.1 : 0.9, // Very light or very dark
    Math.random() * 360, // Random hue
    MAX_CHROMA * 0.2, // Low chroma for bg
  ];

  // Generate harmonic tones based on a hue that contrasts with background
  const baseHue = (bg[1] + 90) % 360; // Offset from bg hue
  const tones =
    system == 0
      ? generateHarmonicTones(baseHue, 'split-complementary')
      : BW_TONES;

  colors.push(toColor(bg, gamut, space, serialize));
  for (let i = 0; i < 15; i++) {
    colors.push(toColor(tones[i % tones.length], gamut, space, serialize));
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

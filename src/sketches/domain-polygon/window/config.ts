import Random from 'canvas-sketch-util/random';
import {
  color,
  keys,
  ColorType,
  black,
  white,
  ColorMode,
} from '../../../colors/radix';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('396727');
// Random.setSeed('597773');
// Random.setSeed('715718');
// Random.setSeed('340387');
// Random.setSeed('791272');

export const config = {
  gap: 0.02,
  debug: false,
  res: Random.pick([
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
  ]),
  r: 4,
  window: {
    toolbar: 20,
    button: 4,
    buttonSpacing: 15,
  },
  toolbar: {
    type: Random.pick(['button', 'knobs']),
    margin: 2,
  },
  inset: 10,
  colorMode: 'light' as ColorMode,
} as const;

interface PartColor {
  base: [string, string, string];
  border: string;
  accent: string;
}

export const colors = {
  parts: (Random.shuffle(keys) as typeof keys)
    .slice(0, 3)
    .map<PartColor>((key: ColorType) => ({
      base: [
        color(key, 3, config.colorMode),
        color(key, 4, config.colorMode),
        color(key, 5, config.colorMode),
      ],
      border: color(key, 6, config.colorMode),
      accent: color(key, 1, config.colorMode),
    })),
  shadow: config.colorMode === 'light' ? black.blackA2 : black.blackA11,
  highlight: config.colorMode === 'light' ? white.whiteA7 : white.whiteA2,
  background: config.colorMode === 'light' ? '#fff' : '#070707',
  text: color('slate', 11, config.colorMode),
  window: {
    background: config.colorMode === 'light' ? white.whiteA12 : black.blackA12,
    topbar: [
      color('slate', 3, config.colorMode),
      color('slate', 5, config.colorMode),
    ],
    outline: color('slate', 6, config.colorMode),
    buttons: [
      color('tomato', 9, config.colorMode),
      color('amber', 9, config.colorMode),
      color('grass', 9, config.colorMode),
    ],
  },
  vector: {
    fg: color('blue', 8, config.colorMode),
    connector: color('slate', 7, config.colorMode),
  },
  toolbar: {
    background: color('slate', 1, config.colorMode),
    parts: (['gray', 'mauve', 'slate', 'sage', 'olive', 'sand'] as const)
      .slice(0, 3)
      .map<PartColor>((key: ColorType) => ({
        base: [
          color(key, config.colorMode === 'light' ? 3 : 5, config.colorMode),
          color(key, 4, config.colorMode),
          color(key, config.colorMode === 'light' ? 5 : 3, config.colorMode),
        ] as [string, string, string],
        border: color(key, 6, config.colorMode),
        accent: color(
          key,
          config.colorMode === 'light' ? 1 : 8,
          config.colorMode
        ),
      })),
  },
};

console.log(config, colors);

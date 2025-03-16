import Random from 'canvas-sketch-util/random';
import {
  color,
  keys,
  ColorType,
  black,
  white,
  ColorMode,
} from '../../../colors/radix';

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
  inset: 10,
  colorMode: 'light' as ColorMode,
};

export const colors = {
  parts: Random.shuffle(keys)
    .slice(0, 3)
    .map((key: ColorType) => ({
      base: [
        color(key, 3, config.colorMode),
        color(key, 4, config.colorMode),
        color(key, 5, config.colorMode),
      ],
      border: color(key, 6, config.colorMode),
      accent: color(key, 1, config.colorMode),
    })),
  shadow: 'rgba(0, 0, 0, 0.1)',
  bg: config.colorMode === 'light' ? white.whiteA12 : black.blackA12,
  window: {
    background: [
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
};

console.log(config, colors);

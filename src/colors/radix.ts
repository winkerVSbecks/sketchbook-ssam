import * as radixColors from '@radix-ui/colors';

// Backgrounds: 1-2
// Interactive components: 3-5
// Borders and separators: 6-8
// Solid colors: 9-10
// Accessible text: 11-12

export const keys = [
  'gray',
  'mauve',
  'slate',
  'sage',
  'olive',
  'sand',
  'tomato',
  'red',
  'ruby',
  'crimson',
  'pink',
  'plum',
  'purple',
  'violet',
  'iris',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'jade',
  'green',
  'grass',
  'bronze',
  'gold',
  'brown',
  'orange',
  'amber',
  'yellow',
  'lime',
  'mint',
  'sky',
] as const;

export type ColorType = (typeof keys)[number];

const type = 'P3';
export type ColorMode = 'light' | 'dark';

const getKey = (variant: ColorMode, colName: string) =>
  variant === 'light' ? `${colName}${type}` : `${colName}Dark${type}`;

export function getRamp(colName: ColorType, variant: ColorMode = 'light'): any {
  const key = getKey(variant, colName);
  return (radixColors as any)[key];
}

export function color(
  colName: ColorType,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
  variant: ColorMode = 'light'
) {
  const key = getKey(variant, colName);
  const shade = `${colName}${level}`;

  return (radixColors as any)[key][shade];
}

export const black = radixColors.blackP3A;
export const white = radixColors.whiteP3A;

export const kellyRadixPairs = [
  // Constants + Variables
  [
    { hue: 'gray', level: 9 },
    { hue: 'red', level: 9 },
  ],
  [
    { hue: 'gray', level: 9 },
    { hue: 'blue', level: 9 },
  ],
  [
    { hue: 'gray', level: 9 },
    { hue: 'green', level: 9 },
  ],
  [
    { hue: 'yellow', level: 9 },
    { hue: 'red', level: 9 },
  ],
  [
    { hue: 'yellow', level: 9 },
    { hue: 'blue', level: 9 },
  ],
  [
    { hue: 'yellow', level: 9 },
    { hue: 'green', level: 9 },
  ],

  // Variable + Variable
  [
    { hue: 'red', level: 9 },
    { hue: 'green', level: 9 },
  ],
  [
    { hue: 'blue', level: 9 },
    { hue: 'orange', level: 9 },
  ],
  [
    { hue: 'purple', level: 9 },
    { hue: 'lime', level: 9 },
  ],
  [
    { hue: 'crimson', level: 9 },
    { hue: 'teal', level: 9 },
  ],
  [
    { hue: 'indigo', level: 9 },
    { hue: 'amber', level: 9 },
  ],
  [
    { hue: 'violet', level: 9 },
    { hue: 'grass', level: 9 },
  ],

  // Pure Constants
  [
    { hue: 'gray', level: 1 },
    { hue: 'gray', level: 12 },
  ],
  [
    { hue: 'gray', level: 9 },
    { hue: 'yellow', level: 9 },
  ],

  // Sophisticated Tinted Grays
  [
    { hue: 'slate', level: 9 },
    { hue: 'amber', level: 9 },
  ],
  [
    { hue: 'mauve', level: 9 },
    { hue: 'jade', level: 9 },
  ],
  [
    { hue: 'sand', level: 9 },
    { hue: 'indigo', level: 9 },
  ],
  [
    { hue: 'sage', level: 9 },
    { hue: 'ruby', level: 9 },
  ],
  [
    { hue: 'olive', level: 9 },
    { hue: 'pink', level: 9 },
  ],
  [
    { hue: 'bronze', level: 9 },
    { hue: 'sky', level: 9 },
  ],
];

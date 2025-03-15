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
type Variant = 'light' | 'dark';

const getKey = (variant: Variant, colName: string) =>
  variant === 'light' ? `${colName}${type}` : `${colName}Dark${type}`;

export function getRamp(colName: ColorType, variant: Variant = 'light'): any {
  const key = getKey(variant, colName);
  return (radixColors as any)[key];
}

export function color(
  colName: ColorType,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
  variant: Variant = 'light'
) {
  const key = getKey(variant, colName);
  const shade = `${colName}${level}`;

  return (radixColors as any)[key][shade];
}

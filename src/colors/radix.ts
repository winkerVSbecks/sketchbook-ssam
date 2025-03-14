import * as radixColors from '@radix-ui/colors';

// Backgrounds: 1-2
// Interactive components: 3-5
// Borders and separators: 6-8
// Solid colors: 9-10
// Accessible text: 11-12

const keys = [
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

type ColorTypes = (typeof keys)[number];

const type = 'P3';
type Variant = 'light' | 'dark';

const getKey = (variant: Variant, name: string) =>
  variant === 'light' ? `${name}${type}` : `${keys[0]}Dark${type}`;

export function getRamp(name: ColorTypes, variant: Variant = 'light'): any {
  const key = getKey(variant, name);
  return (radixColors as any)[key];
}

export function get(
  name: ColorTypes,
  level: number,
  variant: Variant = 'light'
) {
  const key = getKey(variant, name);
  const shade = `${name}${level}`;
  return (radixColors as any)[key][shade];
}

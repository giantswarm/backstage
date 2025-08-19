import { colord } from 'colord';
import { getColor } from './palette';

const availableVariants = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'brown',
] as const;

export type ColorVariant = (typeof availableVariants)[number];

type ColorSet = {
  backgroundColor: string;
  borderColor: string;
};

const DARKEN_AMOUNT = 0.1;
const LIGHTEN_AMOUNT = 0.1;

export function makeColorVariants(): {
  light: Record<ColorVariant, ColorSet>;
  dark: Record<ColorVariant, ColorSet>;
} {
  const lightVariants = Object.fromEntries(
    availableVariants.map(variant => {
      const baseColor = getColor(variant, 'light');

      return [
        variant,
        {
          backgroundColor: baseColor,
          borderColor: colord(baseColor).darken(DARKEN_AMOUNT).toHex(),
        },
      ];
    }),
  ) as Record<ColorVariant, ColorSet>;

  const darkVariants = Object.fromEntries(
    availableVariants.map(variant => {
      const baseColor = getColor(variant, 'dark');

      return [
        variant,
        {
          backgroundColor: baseColor,
          borderColor: colord(baseColor).lighten(LIGHTEN_AMOUNT).toHex(),
        },
      ];
    }),
  ) as Record<ColorVariant, ColorSet>;

  return { light: lightVariants, dark: darkVariants };
}

export function isValidColorVariant(variant: string) {
  return availableVariants.includes(variant as ColorVariant);
}

export function getDefaultColorVariant() {
  return 'gray';
}

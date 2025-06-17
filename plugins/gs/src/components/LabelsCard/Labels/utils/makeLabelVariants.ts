import { colord } from 'colord';
import { getColor } from './palette';

export const availableVariants = [
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
];

export type LabelVariant = (typeof availableVariants)[number];

type ColorSet = {
  keyColor?: string;
  keyBackgroundColor: string;
  valueColor?: string;
  valueBackgroundColor?: string;
  borderColor: string;
};

const DARKEN_AMOUNT = 0.1;
const LIGHTEN_AMOUNT = 0.1;

export function makeLabelVariants(): {
  light: Record<LabelVariant, ColorSet>;
  dark: Record<LabelVariant, ColorSet>;
} {
  const lightVariants = Object.fromEntries(
    availableVariants.map(variant => {
      const baseColor = getColor(variant, 'light');

      return [
        variant,
        {
          keyBackgroundColor: baseColor,
          borderColor: colord(baseColor).darken(DARKEN_AMOUNT).toHex(),
        },
      ];
    }),
  );

  const darkVariants = Object.fromEntries(
    availableVariants.map(variant => {
      const baseColor = getColor(variant, 'dark');

      return [
        variant,
        {
          keyBackgroundColor: baseColor,
          borderColor: colord(baseColor).lighten(LIGHTEN_AMOUNT).toHex(),
        },
      ];
    }),
  );

  return { light: lightVariants, dark: darkVariants };
}

export function isValidLabelVariant(variant: string) {
  return availableVariants.includes(variant);
}

export function getDefaultLabelVariant() {
  return 'gray';
}

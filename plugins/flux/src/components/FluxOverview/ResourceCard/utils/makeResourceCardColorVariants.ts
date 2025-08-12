import { colord } from 'colord';
import { getColor } from './palette';

const availableVariants = ['default', 'error', 'inactive'] as const;

export type ColorVariant = (typeof availableVariants)[number];

type ColorSet = {
  backgroundColor: string;
  backgroundColorHover: string;
};

const HOVER_DARKEN_AMOUNT = 0.01;
const HOVER_LIGHTEN_AMOUNT = 0.01;

export function makeResourceCardColorVariants(): {
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
          backgroundColorHover: colord(baseColor)
            .darken(HOVER_DARKEN_AMOUNT)
            .toHex(),
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
          backgroundColorHover: colord(baseColor)
            .lighten(HOVER_LIGHTEN_AMOUNT)
            .toHex(),
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
  return 'default';
}

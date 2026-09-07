import { Theme } from '@material-ui/core';

/**
 * The five tones a stat or badge can carry, mapped to MUI theme colours.
 *
 * Ported from the muster mockups' Tailwind palette (emerald / amber / red /
 * blue / violet) and defined once so every primitive that colours a value stays
 * consistent instead of each screen re-deriving a colour.
 */
export type Tone = 'ok' | 'warning' | 'error' | 'info' | 'neutral';

/** Mockup violet (`#7c3aed`), used for workflow and "info" accents. */
export const VIOLET = '#7c3aed';

export interface ToneColors {
  /** Strong colour for dots, used at full saturation. */
  main: string;
  /** Readable text colour for labels/values on the page background. */
  text: string;
}

export function toneColors(theme: Theme, tone: Tone): ToneColors {
  const isDark = theme.palette.type === 'dark';
  switch (tone) {
    case 'ok':
      return {
        main: theme.palette.success.main,
        text: theme.palette.success.dark,
      };
    case 'warning':
      return {
        main: theme.palette.warning.main,
        text: theme.palette.warning.dark,
      };
    case 'error':
      return { main: theme.palette.error.main, text: theme.palette.error.dark };
    case 'info':
      return { main: VIOLET, text: isDark ? '#b794f6' : VIOLET };
    case 'neutral':
    default:
      return {
        main: theme.palette.text.disabled,
        text: theme.palette.text.secondary,
      };
  }
}

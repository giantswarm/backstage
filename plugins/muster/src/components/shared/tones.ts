import { Theme } from '@material-ui/core';
import { MCPServerSeverity } from '../../lib/k8s';

/**
 * The five tones the muster mockups use, ported from their Tailwind palette
 * (emerald / amber / red / blue / violet) to MUI theme colours. Defined once
 * here so every primitive (StateBadge, Stat, step badges) stays consistent
 * instead of each screen re-deriving a colour.
 */
export type Tone = 'ok' | 'warning' | 'error' | 'info' | 'neutral';

/** Mockup violet (`#7c3aed`) for workflow / "Calls workflow" accents. */
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

/** Maps the MCPServer severity used across the plugin onto a badge tone. */
export function severityTone(severity: MCPServerSeverity): Tone {
  switch (severity) {
    case 'ok':
      return 'ok';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

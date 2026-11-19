import { useMemo } from 'react';
import { useTheme } from '@material-ui/core';
import { categoricalColors } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The hue of each node measure, from the categorical palette: CPU blue,
 * memory violet, pods aqua. The nodes tables and Karpenter's running summary
 * share them, so a measure reads the same wherever its bar is.
 */
export function useMeasureColors(): {
  cpu: string;
  memory: string;
  pods: string;
} {
  const palette = categoricalColors(useTheme());
  return useMemo(
    () => ({ cpu: palette[0], memory: palette[6], pods: palette[2] }),
    [palette],
  );
}

/** A bar's track, which shows on a card's surface in both themes. */
export const MEASURE_TRACK =
  'color-mix(in srgb, var(--bui-fg-secondary) 30%, transparent)';

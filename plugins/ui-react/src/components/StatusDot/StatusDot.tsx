import type { ReactNode } from 'react';
import { Theme, useTheme } from '@material-ui/core';
import { Text } from '@backstage/ui';

/** What a state means; the same set as the session states' tones. */
export type StatusDotTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusDotProps {
  tone: StatusDotTone;
  /** Visible text after the dot. */
  label?: ReactNode;
  /**
   * The state, for assistive technology, when there is no visible label: the
   * dot then renders as an image with this name and a matching tooltip.
   */
  'aria-label'?: string;
  /** Diameter in px. Defaults to 8. */
  size?: number;
}

function fallbackColor(tone: StatusDotTone, theme: Theme): string {
  switch (tone) {
    case 'warning':
      return theme.palette.warning.main;
    case 'info':
      return theme.palette.info.main;
    case 'success':
      return theme.palette.success.main;
    case 'danger':
      return theme.palette.error.main;
    default:
      return theme.palette.text.secondary;
  }
}

/**
 * A coloured dot for a state, optionally followed by its label.
 *
 * The colour reads `--agent-platform-state-dot-<tone>` first, the variable the
 * sessions list's dots use, so an app stylesheet recolours every state dot at
 * once; the theme palette is the fallback.
 */
export function StatusDot({
  tone,
  label,
  'aria-label': ariaLabel,
  size = 8,
}: StatusDotProps) {
  const theme = useTheme();
  const dot = (
    <span
      data-tone={tone}
      role={label === undefined && ariaLabel ? 'img' : undefined}
      aria-label={label === undefined ? ariaLabel : undefined}
      aria-hidden={label !== undefined || !ariaLabel ? true : undefined}
      title={label === undefined ? ariaLabel : undefined}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: `var(--agent-platform-state-dot-${tone}, ${fallbackColor(
          tone,
          theme,
        )})`,
      }}
    />
  );

  if (label === undefined) {
    return dot;
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--bui-space-2)',
        minWidth: 0,
      }}
    >
      {dot}
      <Text variant="body-medium" truncate style={{ minWidth: 0 }}>
        {label}
      </Text>
    </span>
  );
}

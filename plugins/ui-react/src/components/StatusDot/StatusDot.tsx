import type { ReactNode } from 'react';
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
  /**
   * A CSS custom property read before the tone's bui token, for a family of
   * dots an app stylesheet recolours together, e.g.
   * `--agent-platform-state-dot-success` for the session states.
   */
  colorVar?: string;
}

/** The bui foreground colour each tone falls back to. */
const TONE_TOKENS: Record<StatusDotTone, string> = {
  neutral: 'var(--bui-fg-secondary)',
  info: 'var(--bui-fg-announcement)',
  success: 'var(--bui-fg-positive)',
  warning: 'var(--bui-fg-warning)',
  danger: 'var(--bui-fg-negative)',
};

/**
 * A coloured dot for a state, optionally followed by its label: the bui
 * foreground token for the tone, or `colorVar` where the app sets it.
 */
export function StatusDot({
  tone,
  label,
  'aria-label': ariaLabel,
  size = 8,
  colorVar,
}: StatusDotProps) {
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
        backgroundColor: colorVar
          ? `var(${colorVar}, ${TONE_TOKENS[tone]})`
          : TONE_TOKENS[tone],
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

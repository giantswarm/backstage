import type { CSSProperties, ReactNode } from 'react';

/**
 * The platform's content column, as the rest of the shell draws it: the same
 * `max-width` + `margin: 0 auto` idiom as `ShellPage` (Customize, Sessions)
 * and the session detail's reading column.
 *
 * The Usage screen used to let its views fill the whole content area, which
 * made it the one screen that read differently from the rest of the platform.
 * Every Usage view wraps its content in this, and the second-level tab strip
 * sits in the same column, so the strip and the content stay aligned at every
 * width. Below the max width nothing changes, so the 375px layout is
 * untouched.
 */

/** The same content width as `ShellPage` (Customize, Sessions). */
export const USAGE_COLUMN_MAX_WIDTH = 1080;

const style: CSSProperties = {
  width: '100%',
  maxWidth: USAGE_COLUMN_MAX_WIDTH,
  margin: '0 auto',
  boxSizing: 'border-box',
};

export function UsageColumn({ children }: { children: ReactNode }) {
  return <div style={style}>{children}</div>;
}

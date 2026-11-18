import type { CSSProperties, ReactNode } from 'react';

/**
 * The shell's content width: the most a page's content column takes before it
 * centres in a wider view. `ShellPage` and `ContentColumn` both use it.
 */
export const SHELL_CONTENT_MAX_WIDTH = 1080;

const style: CSSProperties = {
  width: '100%',
  maxWidth: SHELL_CONTENT_MAX_WIDTH,
  margin: '0 auto',
  boxSizing: 'border-box',
};

/**
 * A centred content column at the shell's content width
 * ({@link SHELL_CONTENT_MAX_WIDTH}), for a view that sits inside the shell
 * without `ShellPage` but should line up with the pages that use it. Put a tab
 * strip above the views in the same column so the strip and the content stay
 * aligned. Below the maximum width it fills the available width.
 */
export function ContentColumn({ children }: { children: ReactNode }) {
  return <div style={style}>{children}</div>;
}

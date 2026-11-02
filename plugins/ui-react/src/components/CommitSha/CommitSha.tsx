import type { CSSProperties } from 'react';
import { shortSha } from '@giantswarm/backstage-plugin-gs-common';
import { CopyButton } from '../CopyButton';
import { useTouchInput } from '../../utils/breakpoints';

export type CommitShaProps = {
  /** The full value: a commit SHA, a Flux revision, a version or digest that carries one. */
  value: string;
  /**
   * Whether a touch screen gets a copy button beside the SHA. `false` inside
   * a link, a row or a selectable card, where a button cannot go: the `title`
   * alone carries the full value there.
   */
  copy?: boolean;
  /** Styles the text, e.g. `MONO` in a Technical details fact. */
  style?: CSSProperties;
  className?: string;
};

/** The copy button, on a touch screen only, which never shows a `title`. */
function CopyOnTouch({ value, short }: { value: string; short: string }) {
  const isTouch = useTouchInput();
  if (!isTouch) {
    return null;
  }
  return (
    <CopyButton text={value} label={`Copy ${short} in full`} size="compact" />
  );
}

/**
 * A git commit SHA shortened by `shortSha`, with the full value at hand: its
 * `title` on a pointer, and a copy button beside it on a touch screen. These
 * are the ids someone retypes into `git` or `kubectl`. A value with no SHA in
 * it renders as it is.
 */
export function CommitSha({
  value,
  copy = true,
  style,
  className,
}: CommitShaProps) {
  const short = shortSha(value);
  if (short === value) {
    return (
      <span style={style} className={className}>
        {value}
      </span>
    );
  }
  return (
    <>
      <span style={style} className={className} title={value}>
        {short}
      </span>
      {copy && <CopyOnTouch value={value} short={short} />}
    </>
  );
}

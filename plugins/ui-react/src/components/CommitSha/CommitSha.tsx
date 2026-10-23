import type { CSSProperties } from 'react';
import { shortSha } from '@giantswarm/backstage-plugin-gs-common';
import { CopyButton } from '../CopyButton';
import { useTouchInput } from '../../utils/breakpoints';

export type CommitShaProps = {
  /** The full value: a commit SHA, a Flux revision, a version or digest that carries one. */
  value: string;
  /** Styles the text, e.g. `MONO` in a Technical details fact. */
  style?: CSSProperties;
};

/**
 * A git commit SHA shortened to seven characters by `shortSha`, with the full
 * value at hand: its `title` on a pointer, and a copy button beside it on a
 * touch screen, which never shows a `title`. These are the ids someone
 * retypes into `git` or `kubectl`. A value with no SHA in it renders as it is.
 */
export function CommitSha({ value, style }: CommitShaProps) {
  const isTouch = useTouchInput();
  const short = shortSha(value);
  if (short === value) {
    return <span style={style}>{value}</span>;
  }
  return (
    <>
      <span style={style} title={value}>
        {short}
      </span>
      {isTouch && (
        <CopyButton
          text={value}
          label={`Copy ${short} in full`}
          size="compact"
        />
      )}
    </>
  );
}

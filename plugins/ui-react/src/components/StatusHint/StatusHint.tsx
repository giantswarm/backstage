import { InfoHint } from '../InfoHint';

export interface StatusHintProps {
  /** What the state belongs to, for the button's name: "About the state of <subject>". */
  subject: string;
  /**
   * Why the state is what it is: one sentence, or several, each on a line of
   * its own. Nothing renders while it is empty.
   */
  explanation?: string | readonly string[];
}

/**
 * The explanation of a state in a list, beside its few words: a table's or a
 * stacked row's status stays a dot and a short label, and the sentences that
 * say why sit behind this {@link InfoHint} — a tooltip on hover and focus, and
 * in the shell a popover on a press, the way in on a touch screen.
 */
export function StatusHint({ subject, explanation }: StatusHintProps) {
  const lines = (
    typeof explanation === 'string' ? [explanation] : (explanation ?? [])
  ).filter(line => line.trim() !== '');
  if (lines.length === 0) {
    return null;
  }
  return (
    <InfoHint label={`About the state of ${subject}`} size="medium">
      {lines.join('\n')}
    </InfoHint>
  );
}

import { Text } from '@backstage/ui';
import { formatCount } from '@giantswarm/backstage-plugin-agent-platform-common';

export interface TruncatedListNoteProps {
  /** What the list holds, plural: "tools", "prompts". */
  plural: string;
  /** muster flagged the answer as cut at its limit. */
  truncated?: boolean;
  /** How many entries the list holds. */
  shown?: number;
  /** How many muster says exist, where the read reports it. */
  total?: number;
}

/**
 * Says a capability list is only part of what muster has. With both figures
 * it says how much; without them (the tool catalogue reports no per-server
 * total) it says the list may be incomplete. Renders nothing for a whole list.
 */
export function TruncatedListNote({
  plural,
  truncated,
  shown,
  total,
}: TruncatedListNoteProps) {
  const counted = shown !== undefined && total !== undefined && total > shown;
  if (!truncated && !counted) {
    return null;
  }
  return (
    <Text as="p" variant="body-small" color="secondary">
      {counted
        ? `This list is incomplete: muster returned ${formatCount(
            shown,
          )} of ${formatCount(total)} ${plural}.`
        : `This list may be incomplete: muster returned only part of the ${plural}.`}
    </Text>
  );
}

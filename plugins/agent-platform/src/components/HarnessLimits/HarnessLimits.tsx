import { useId } from 'react';
import { Flex, Text } from '@backstage/ui';
import type { ClaudeHarnessLimits } from '@giantswarm/backstage-plugin-kubernetes-react';

import { harnessLimitEntries } from '../../lib/harnesses';

const LIST_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content auto',
  columnGap: 12,
  rowGap: 2,
  margin: 0,
};

/**
 * The limits a Claude Code Harness sets, read-only: they live on the Harness
 * and bound every agent on it, so nothing about one agent changes them.
 *
 * Renders nothing when the Harness sets none, unless `showWhenUnset` asks for
 * the group to say so (the create wizard, where the absence is worth knowing
 * before the agent exists).
 */
export function HarnessLimits({
  limits,
  harnessName,
  showWhenUnset = false,
  showTitle = true,
}: {
  limits: ClaudeHarnessLimits | undefined;
  /** Named in the note, when known. */
  harnessName?: string;
  showWhenUnset?: boolean;
  /** Off where the surrounding layout already labels the group. */
  showTitle?: boolean;
}) {
  const titleId = useId();
  const entries = harnessLimitEntries(limits);
  if (entries.length === 0 && !showWhenUnset) {
    return null;
  }
  const harness = harnessName ? `the Harness ${harnessName}` : 'the Harness';

  return (
    <Flex
      direction="column"
      gap="1"
      role="group"
      {...(showTitle
        ? { 'aria-labelledby': titleId }
        : { 'aria-label': 'Limits' })}
    >
      {showTitle && (
        <Text id={titleId} variant="body-small" weight="bold">
          Limits
        </Text>
      )}
      {entries.length > 0 ? (
        <>
          <dl style={LIST_STYLE}>
            {entries.map(entry => (
              <div key={entry.label} style={{ display: 'contents' }}>
                <dt>
                  <Text variant="body-small" color="secondary">
                    {entry.label}
                  </Text>
                </dt>
                <dd style={{ margin: 0 }}>
                  <Text variant="body-small">{entry.value}</Text>
                </dd>
              </div>
            ))}
          </dl>
          <Text variant="body-x-small" color="secondary">
            Set on {harness}; they apply to every agent on it.
          </Text>
        </>
      ) : (
        <Text variant="body-small" color="secondary">
          None set on {harness}. Limits are set on the Harness and apply to
          every agent on it.
        </Text>
      )}
    </Flex>
  );
}

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
 * The per-turn limits a Claude Code Harness sets, read-only. Renders nothing
 * when none are set, unless `showWhenUnset`.
 */
export function HarnessLimits({
  limits,
  harnessName,
  showWhenUnset = false,
  showTitle = true,
}: {
  limits: ClaudeHarnessLimits | undefined;
  harnessName?: string;
  showWhenUnset?: boolean;
  showTitle?: boolean;
}) {
  const entries = harnessLimitEntries(limits);
  if (entries.length === 0 && !showWhenUnset) {
    return null;
  }
  const harness = harnessName ? `Harness ${harnessName}` : 'the Harness';

  return (
    <Flex direction="column" gap="1" role="group" aria-label="Limits">
      {showTitle && (
        <Text variant="body-small" weight="bold">
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
            Set on {harness}, shared by every agent on it.
          </Text>
        </>
      ) : (
        <Text variant="body-small" color="secondary">
          No limits set on {harness}.
        </Text>
      )}
    </Flex>
  );
}

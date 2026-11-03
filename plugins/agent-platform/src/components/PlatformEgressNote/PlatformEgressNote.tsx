import { FieldLabel, Flex, Text } from '@backstage/ui';

import { PLATFORM_EGRESS_COPY } from '../../lib/egressCopy';

/**
 * The agent form's egress on a coding Harness, in place of Extra egress
 * origins: such an agent reaches the platform's list for its Harness only and
 * agent-manager refuses any other origin (`guardCoding`), so nothing is
 * offered that would be refused. `origins` is that list where the portal
 * knows it (`platformEgressOf`, the seam for agent-manager's
 * `get_info.harnessEgress`); without it, the line says only who sets it.
 */
export function PlatformEgressNote({
  runtime,
  origins,
}: {
  /** The Harness as a person names it (`harnessTitle`). */
  runtime: string;
  origins?: string[];
}) {
  return (
    <Flex direction="column" gap="2">
      <FieldLabel label={PLATFORM_EGRESS_COPY.label} />
      <Text variant="body-small" color="secondary">
        {origins
          ? PLATFORM_EGRESS_COPY.listed(runtime, origins)
          : PLATFORM_EGRESS_COPY.unlisted(runtime)}
      </Text>
    </Flex>
  );
}

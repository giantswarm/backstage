import { Badge, Flex, Text } from '@backstage/ui';
import {
  describeInstallationGroup,
  type GroupNoun,
  type InstallationGroup,
} from '../../lib/installationGroups';

export type InstallationGroupHeaderProps = {
  group: InstallationGroup<unknown>;
  noun: GroupNoun;
};

/**
 * The heading of one installation's group in a fleet-wide list: the
 * installation's name and pipeline, and a status line -- how many rows, still
 * loading, nothing here, could not be read, or not reachable from this portal.
 */
export function InstallationGroupHeader({
  group,
  noun,
}: InstallationGroupHeaderProps) {
  return (
    <Flex
      align="baseline"
      gap="2"
      style={{ flexWrap: 'wrap' }}
      data-testid={`installation-group-${group.installation}`}
    >
      <Text as="h3" variant="title-x-small">
        {group.installation}
      </Text>
      {group.pipeline && <Badge size="small">{group.pipeline}</Badge>}
      <Text variant="body-small" color="secondary">
        {describeInstallationGroup(group, noun)}
      </Text>
    </Flex>
  );
}

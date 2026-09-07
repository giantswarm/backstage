import type { ReactNode } from 'react';
import { Box, Flex } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import type {
  GroupNoun,
  InstallationGroup,
} from '../../lib/installationGroups';
import { InstallationGroupHeader } from './InstallationGroupHeader';

export type InstallationGroupsProps<Row> = {
  groups: InstallationGroup<Row>[];
  noun: GroupNoun;
  /** Renders one group's rows -- the same table the flat view uses. */
  renderRows: (rows: Row[], group: InstallationGroup<Row>) => ReactNode;
  /** Rendered instead of the groups when there are none (nothing known yet). */
  fallback?: ReactNode;
};

/**
 * A fleet-wide list as one section per installation, for the "All
 * installations" scope: the home installation's group first, the others as
 * they answer. Each group is headed by its installation and status; a group
 * with rows renders them with `renderRows`, one still loading shows a thin
 * progress bar, and one with nothing to show (empty, unreadable, not
 * reachable) is its header alone -- the status line says why.
 */
export function InstallationGroups<Row>({
  groups,
  noun,
  renderRows,
  fallback = null,
}: InstallationGroupsProps<Row>) {
  if (groups.length === 0) {
    return <>{fallback}</>;
  }

  return (
    <Flex direction="column" gap="5">
      {groups.map(group => (
        <Flex key={group.installation} direction="column" gap="2">
          <InstallationGroupHeader group={group} noun={noun} />
          {group.status === 'ready' && (
            <Box>{renderRows(group.rows, group)}</Box>
          )}
          {group.status === 'loading' && (
            <LinearProgress
              aria-label={`Loading ${noun.many} from ${group.installation}`}
            />
          )}
        </Flex>
      ))}
    </Flex>
  );
}

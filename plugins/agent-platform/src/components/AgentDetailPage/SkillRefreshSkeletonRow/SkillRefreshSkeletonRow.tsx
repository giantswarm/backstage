import { Flex } from '@backstage/ui';

import { CellSkeleton } from '../CellSkeleton';

/**
 * A row of the Update skills table before the agent's skills are read, in the
 * shape of a real one: name over source, pin, head and outcome.
 */
export function SkillRefreshSkeletonRow() {
  return (
    <tr aria-hidden>
      <td>
        <Flex direction="column" gap="1">
          <CellSkeleton width="50%" />
          <CellSkeleton width="80%" />
        </Flex>
      </td>
      <td>
        <CellSkeleton width="70%" />
      </td>
      <td>
        <CellSkeleton width="80%" />
      </td>
      <td>
        <CellSkeleton width="70%" />
      </td>
    </tr>
  );
}

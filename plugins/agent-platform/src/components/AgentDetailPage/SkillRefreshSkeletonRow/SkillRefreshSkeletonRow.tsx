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
        {/* The real cell's name over its source, at their line heights and
            gap, so the row does not grow when the skills arrive. */}
        <Flex direction="column" gap="0.5">
          <CellSkeleton width="50%" />
          <CellSkeleton width="80%" variant="body-x-small" />
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

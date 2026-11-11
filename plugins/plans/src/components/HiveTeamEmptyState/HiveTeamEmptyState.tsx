import { EmptyState } from '@backstage/core-components';
import { ButtonLink } from '@backstage/ui';
import { teamName } from '../../lib/hive';

/**
 * A magazine tab for a team the magazine writes no data set for: says so
 * and leads to the team's board, which the Roadmap tab has for every team.
 */
export function HiveTeamEmptyState(props: {
  team: string;
  /** What the tab shows, in prose: "what the team works on now". */
  what: string;
}) {
  const { team, what } = props;
  const name = teamName(team);
  return (
    <EmptyState
      missing="data"
      title={`No magazine data for Team ${name} yet`}
      description={`The magazine does not collect ${what} for Team ${name}. The Roadmap tab has its whole board.`}
      action={
        <ButtonLink
          href={`/hive/roadmap?team=${encodeURIComponent(team)}`}
          variant="secondary"
        >
          Open the board
        </ButtonLink>
      }
    />
  );
}

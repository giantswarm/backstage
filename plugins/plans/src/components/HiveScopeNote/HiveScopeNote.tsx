import { Alert, ButtonLink } from '@backstage/ui';
import { followsTeam, teamName } from '../../lib/hive';

/**
 * Says what a magazine tab shows for a team the magazine does not follow:
 * that team's work where it touches the magazine's team, with the way to
 * the team's whole board. Nothing for the magazine's own team or all teams.
 */
export function HiveScopeNote(props: { team: string; magazineTeam: string }) {
  const { team, magazineTeam } = props;
  if (followsTeam(team, magazineTeam)) {
    return null;
  }
  return (
    <Alert
      status="info"
      title={`Hive follows Team ${teamName(magazineTeam)}`}
      description={`Here you see Team ${teamName(team)}'s work where it touches Team ${teamName(magazineTeam)}'s. The Roadmap tab has Team ${teamName(team)}'s whole board.`}
      customActions={
        <ButtonLink
          href={`/hive/roadmap?team=${encodeURIComponent(team)}`}
          variant="secondary"
          size="small"
        >
          Open the board
        </ButtonLink>
      }
    />
  );
}

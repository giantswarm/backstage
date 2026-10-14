import { Flex, Text } from '@backstage/ui';

export type SweepProgressProps = {
  /** marge's last report per team, such as `34 of 79 PRs done`. */
  progress: Record<string, string>;
  /** Name each team; a run of one team needs no name. */
  showTeam?: boolean;
};

/**
 * Where a run in flight stands, per team, as marge last reported it. The
 * reports arrive while marge works, so a long run shows its advance instead
 * of a spinner alone.
 */
export function SweepProgress({
  progress,
  showTeam = false,
}: SweepProgressProps) {
  const teams = Object.keys(progress).sort((a, b) => a.localeCompare(b, 'en'));
  if (teams.length === 0) {
    return null;
  }
  return (
    <Flex direction="column" gap="1" role="status" aria-live="polite">
      {teams.map(team => (
        <Text key={team} variant="body-small" color="secondary">
          {showTeam ? `${team}: ${progress[team]}` : progress[team]}
        </Text>
      ))}
    </Flex>
  );
}

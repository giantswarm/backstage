import { useEffect, useMemo, useState } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useMargeTeamSweeps } from '../../hooks/useMarge';
import {
  actionsArgument,
  MERGE_GREEN_STEPS,
  rowsOf,
  type BotPrRow,
} from '../../lib/marge';
import { greenByTeam } from '../../lib/rows';
import { ConnectMargeAlert } from '../ConnectMargeAlert';
import { OutcomeList } from '../OutcomeList';

export type MergeGreenDialogProps = {
  installation: string;
  /** The rows in view; the green ones are the targets. */
  rows: BotPrRow[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const ACTIONS = actionsArgument(MERGE_GREEN_STEPS);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Approve and merge every green PR in view, in one confirmation.
 *
 * The targets are the PRs the engine filed as green under their team's
 * policy, and only those: one `x_marge_sweep` per team, narrowed with `prs`,
 * with `approve` and `merge` as the steps. The preview is the same calls with
 * `dry_run`, so what the dialog lists is a live classification, not the
 * stored label the table shows; a PR that stopped being green in between is
 * held by the engine's own guards and says so.
 *
 * The preview is the review, so one confirmation covers every PR it lists:
 * these are the steps a scheduled sweep runs unattended, under the team
 * policy's own update types and every required check. The per-PR
 * confirmation of the sweep dialog belongs to the rescue path, where an agent
 * writes code, and not here. Every call goes through muster as the signed-in
 * person, so the approval and the merge are theirs.
 */
export function MergeGreenDialog({
  installation,
  rows,
  isOpen,
  onOpenChange,
}: MergeGreenDialogProps) {
  const sweeps = useMargeTeamSweeps(installation);
  const [applied, setApplied] = useState(false);

  const targets = useMemo(() => greenByTeam(rows), [rows]);
  const targetsKey = JSON.stringify(targets);
  const teams = Object.keys(targets);
  const count = Object.values(targets).reduce(
    (sum, refs) => sum + refs.length,
    0,
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setApplied(false);
    sweeps.reset();
    sweeps
      .run({ prsByTeam: targets, actions: ACTIONS, dryRun: true })
      .catch(() => {
        // Shown by the dialog through the runs' own errors.
      });
    // A new open, or a new set of targets, is a new preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetsKey, installation]);

  const runs = sweeps.runs;
  const isDryRun = sweeps.isDryRun;
  const preview = useMemo(
    () => (isDryRun ? runs : []),
    // Keyed on the runs themselves: react-query hands back the same array
    // until the next call settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDryRun, runs],
  );
  const outcome = isDryRun ? [] : runs;
  // Exactly the PRs the preview listed, so one that appeared in between is
  // not swept unseen.
  const applyTargets = useMemo(() => {
    const byTeam: Record<string, string[]> = {};
    for (const run of preview) {
      const refs = rowsOf(run.result, run.team).map(row => row.ref);
      if (refs.length > 0) {
        byTeam[run.team] = refs;
      }
    }
    return byTeam;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);
  const applyCount = Object.values(applyTargets).reduce(
    (sum, refs) => sum + refs.length,
    0,
  );
  const failed = runs.filter(run => run.error);
  const notConnected = sweeps.notConnected;

  const onConfirm = async () => {
    if (applied) {
      onOpenChange(false);
      return;
    }
    try {
      await sweeps.run({
        prsByTeam: applyTargets,
        actions: ACTIONS,
        dryRun: false,
      });
      setApplied(true);
    } catch {
      // Shown by the dialog through the runs' own errors.
    }
  };

  let confirmLabel = `Approve and merge ${plural(applyCount, 'PR')}`;
  if (applied) {
    confirmLabel = 'Close';
  }

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Approve and merge the green PRs"
      confirmLabel={confirmLabel}
      busyLabel={sweeps.isDryRun ? 'Previewing…' : 'Applying…'}
      isBusy={sweeps.isPending}
      isConfirmDisabled={
        !applied &&
        (sweeps.isPending || applyCount === 0 || Boolean(notConnected))
      }
      onConfirm={onConfirm}
      width="min(90vw, 760px)"
    >
      {!applied ? (
        <Text variant="body-small" color="secondary">
          {`The ${plural(count, 'PR')} the last read filed as green across ${plural(
            teams.length,
            'team',
          )}. The engine approves what its team policy approves, then merges
          what it approved, under the same guards a sweep runs: a pending
          check is a wait, a failing security check is never merged past, and
          a major update is never merged unless the policy says so.`}
        </Text>
      ) : null}
      {notConnected ? (
        <ConnectMargeAlert
          installation={installation}
          message={notConnected.message}
        />
      ) : null}
      {sweeps.isPending && sweeps.isDryRun ? (
        <Text variant="body-small" color="secondary">
          Classifying every green PR again and deciding what the run would do to
          each.
        </Text>
      ) : null}
      {failed.length > 0 && !notConnected ? (
        <Alert
          status="danger"
          title={`marge refused the run for ${failed
            .map(run => run.team)
            .join(', ')}`}
          description={[
            ...new Set(failed.map(run => run.error?.message ?? '')),
          ].join(' ')}
        />
      ) : null}
      {applied && outcome.length > 0 ? (
        <Alert
          status="success"
          title="Applied"
          description="The engine ran approve and merge as you. What it did to each PR is below, and in each PR's evidence comment."
        />
      ) : null}
      {!applied && !sweeps.isPending && preview.length > 0 ? (
        <Text variant="body-small" color="secondary">
          {`Apply runs exactly this, on the ${plural(applyCount, 'PR')} listed.`}
        </Text>
      ) : null}
      {(applied ? outcome : preview)
        .filter(run => run.result)
        .map(run => (
          <Flex key={run.team} direction="column" gap="2">
            {teams.length > 1 ? (
              <Text variant="body-medium" weight="bold">
                {run.team}
              </Text>
            ) : null}
            <OutcomeList result={run.result!} />
          </Flex>
        ))}
    </ConfirmDialog>
  );
}

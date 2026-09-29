import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useMargeTeamSweeps, type TeamSweepRun } from '../../hooks/useMarge';
import {
  actionsArgument,
  GREEN_GROUP,
  MargeAnswerLostError,
  MERGE_GREEN_STEPS,
  rowsOf,
  type BotPrRow,
} from '../../lib/marge';
import { greenByTeam, refsByTeam } from '../../lib/rows';
import { ConnectMargeAlert } from '../ConnectMargeAlert';
import { LostAnswerAlert } from '../LostAnswerAlert';
import { OutcomeTable } from '../OutcomeTable';

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

const sumOf = (byTeam: Record<string, string[]>) =>
  Object.values(byTeam).reduce((sum, refs) => sum + refs.length, 0);

/**
 * Approve and merge every green PR in view, in one confirmation.
 *
 * The targets are the PRs the engine filed as green under their team's
 * policy, and only those: one `x_marge_sweep` per team, narrowed with `prs`,
 * with `approve` and `merge` as the steps. The preview is the same calls with
 * `dry_run`, so what the dialog lists is a live classification, not the
 * stored label the table shows.
 *
 * The preview is the review, so one confirmation covers every PR it still
 * found green, and only those: a PR that stopped being green in between is
 * listed with the engine's reason and left out of the apply, so the button's
 * count is what gets merged and nothing the preview showed as held is merged
 * behind it. These are the steps a scheduled sweep runs unattended, under the
 * team policy's own update types and every required check; the per-PR
 * confirmation of the sweep dialog belongs to the rescue path, where an agent
 * writes code, and not here. Every call goes through muster as the signed-in
 * person, so the approval and the merge are theirs.
 *
 * A team whose answer was lost on the way back is not a team marge refused:
 * its preview runs again on its own, and a lost apply is reported as an
 * unknown outcome, never as nothing merged.
 */
export function MergeGreenDialog({
  installation,
  rows,
  isOpen,
  onOpenChange,
}: MergeGreenDialogProps) {
  const sweeps = useMargeTeamSweeps(installation);
  const [applied, setApplied] = useState(false);
  // Held apart from the hook's runs, which the apply call replaces the
  // moment it starts: the preview stays readable while the apply is in
  // flight, and it is what the apply acts on.
  const [preview, setPreview] = useState<TeamSweepRun[]>([]);
  // Which open of the dialog an answer belongs to: a preview that answers
  // after a close, or after the next open, is dropped.
  const openCount = useRef(0);

  const targets = useMemo(() => greenByTeam(rows), [rows]);
  const targetsKey = JSON.stringify(targets);
  const teams = Object.keys(targets);
  const count = sumOf(targets);

  const keepPreview = (answering: Promise<TeamSweepRun[]>) => {
    const open = openCount.current;
    answering
      .then(answer => {
        if (openCount.current === open) {
          setPreview(answer);
        }
      })
      .catch(() => {
        // Shown by the dialog through the runs' own errors.
      });
  };

  useEffect(() => {
    openCount.current += 1;
    if (!isOpen) {
      return;
    }
    setApplied(false);
    setPreview([]);
    sweeps.reset();
    keepPreview(
      sweeps.run({ teams, prsByTeam: targets, actions: ACTIONS, dryRun: true }),
    );
    // A new open, or a new set of targets, is a new preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetsKey, installation]);

  const runs = sweeps.runs;
  const isPreviewing = sweeps.isPending && sweeps.isDryRun;
  const isApplying = sweeps.isPending && !sweeps.isDryRun;
  const previewRows = useMemo(
    () => preview.flatMap(run => rowsOf(run.result, run.team)),
    [preview],
  );
  // What Apply runs on: the PRs the preview still found green, per team.
  const applyRows = useMemo(
    () => previewRows.filter(row => row.group === GREEN_GROUP),
    [previewRows],
  );
  const applyTargets = useMemo(() => refsByTeam(applyRows), [applyRows]);
  const applyCount = sumOf(applyTargets);
  const notGreen = previewRows.length - applyCount;
  const failed = runs.filter(run => run.error);
  const lost = failed
    .filter(run => run.error instanceof MargeAnswerLostError)
    .map(run => run.team);
  const refused = failed.filter(run => !lost.includes(run.team));
  const notConnected = sweeps.notConnected;

  const onConfirm = async () => {
    try {
      await sweeps.run({
        teams: Object.keys(applyTargets),
        prsByTeam: applyTargets,
        actions: ACTIONS,
        dryRun: false,
      });
      setApplied(true);
    } catch {
      // Shown by the dialog through the runs' own errors.
    }
  };

  const outcomeCount = applied
    ? runs.flatMap(run => rowsOf(run.result, run.team)).length
    : 0;
  const confirmCount = isPreviewing ? count : applyCount;
  const confirmLabel =
    confirmCount > 0
      ? `Approve and merge ${plural(confirmCount, 'PR')}`
      : 'Approve and merge';
  const shown = applied ? runs : preview;
  // A preview run again for one team keeps the other teams' rows in view.
  const isTablePending = isPreviewing && !shown.some(run => run.result);

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Approve and merge ${plural(count, 'green PR')}`}
      confirmLabel={confirmLabel}
      busyLabel="Approving and merging…"
      isBusy={isApplying}
      isDone={applied}
      isConfirmDisabled={
        isPreviewing || applyCount === 0 || Boolean(notConnected)
      }
      onConfirm={onConfirm}
      width="min(92vw, 880px)"
    >
      {applied ? null : (
        <Text variant="body-medium" color="secondary">
          marge checks each PR again, then approves and merges it as you under
          its team&apos;s policy. A PR that is no longer green is left alone.
        </Text>
      )}
      {notConnected ? (
        <ConnectMargeAlert
          installation={installation}
          message={notConnected.message}
        />
      ) : null}
      {refused.length > 0 && !notConnected ? (
        <Alert
          status="danger"
          icon
          title={`marge refused the run for ${refused
            .map(run => run.team)
            .join(', ')}`}
          description={`${[
            ...new Set(refused.map(run => run.error?.message ?? '')),
          ].join(' ')} Nothing was approved or merged for ${
            refused.length === 1 ? 'it' : 'them'
          }.`}
        />
      ) : null}
      {lost.length > 0 ? (
        <LostAnswerAlert
          teams={lost}
          isDryRun={sweeps.isDryRun}
          onPreviewAgain={() => keepPreview(sweeps.retry(lost))}
          isPreviewingAgain={isPreviewing}
          asked="approved and merged"
          prs={applyRows.filter(row => lost.includes(row.team))}
        />
      ) : null}
      {!applied && !isPreviewing && notGreen > 0 ? (
        <Alert
          status="warning"
          icon
          title={
            applyCount === 0
              ? 'None of the PRs is green any more'
              : `${notGreen} of ${plural(previewRows.length, 'PR')} ${
                  notGreen === 1 ? 'is' : 'are'
                } no longer green`
          }
          description={
            applyCount === 0
              ? 'There is nothing to approve and merge. The Result column says why for each PR.'
              : `marge leaves ${
                  notGreen === 1 ? 'it' : 'them'
                } alone and says why in the Result column. Approve and merge acts on the other ${plural(
                  applyCount,
                  'PR',
                )}.`
          }
        />
      ) : null}
      {applied && runs.some(run => run.result) ? (
        <Alert
          status="success"
          icon
          title={`Approve and merge ran on ${plural(outcomeCount, 'PR')}`}
          description="The result for each PR is below, and in its evidence comment on GitHub."
        />
      ) : null}
      {isPreviewing || shown.some(run => run.result) ? (
        <OutcomeTable
          runs={shown}
          isPending={isTablePending}
          pendingLabel={`Checking ${plural(count, 'PR')}…`}
          showTeam={teams.length > 1}
        />
      ) : null}
    </ConfirmDialog>
  );
}

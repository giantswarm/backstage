import { useEffect, useMemo, useState } from 'react';
import { Alert, Checkbox, Flex, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useMargeTeamSweeps } from '../../hooks/useMarge';
import {
  actionsArgument,
  rowsOf,
  SWEEP_STEPS,
  type SweepStep,
} from '../../lib/marge';
import { ConnectMargeAlert } from '../ConnectMargeAlert';
import { OutcomeTable } from '../OutcomeTable';

export type SweepDialogProps = {
  installation: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /**
   * The PRs to sweep (`OWNER/REPO#NUMBER`), per team: what the person ticked
   * on the page, or the one PR of an expanded row. A team is one call, so a
   * key is a call.
   */
  prsByTeam: Record<string, string[]>;
};

const ALL_STEPS: SweepStep[] = SWEEP_STEPS.map(step => step.id);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Preview, then Apply, for one `x_marge_sweep` per team of the selection.
 *
 * The steps are the engine's own, every one ticked to begin with, the way a
 * CLI sweep runs them; unticking one narrows `actions` the way `--actions`
 * does, and the preview runs again, because the answer depends on the steps.
 * The preview is the call with `dry_run: true`: a live classification of the
 * PRs the person picked on the page and the step the engine would take on
 * each. Apply repeats the call without `dry_run`, narrowed with `prs` to
 * exactly the PRs the preview listed, so a PR that appeared in between is not
 * swept unseen. A refusal is an outcome row with its reason; there is no
 * override to offer, because the engine has none.
 *
 * The PRs are picked in the table, so this dialog offers no picker of its
 * own: it is the preview of a decision already taken.
 *
 * A team is its own call and its own outcome: one team's refusal leaves the
 * others alone, and the dialog reports each under its name.
 */
export function SweepDialog({
  installation,
  isOpen,
  onOpenChange,
  prsByTeam,
}: SweepDialogProps) {
  const sweeps = useMargeTeamSweeps(installation);
  const [steps, setSteps] = useState<SweepStep[]>(ALL_STEPS);
  const [applied, setApplied] = useState(false);

  const actions = actionsArgument(steps);
  const teams = useMemo(() => Object.keys(prsByTeam), [prsByTeam]);
  const targetCount = Object.values(prsByTeam).reduce(
    (sum, refs) => sum + refs.length,
    0,
  );
  // Keyed on contents: the page derives the map fresh on every render.
  const targetsKey = JSON.stringify(prsByTeam);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setApplied(false);
    sweeps.reset();
    sweeps.run({ teams, prsByTeam, actions, dryRun: true }).catch(() => {
      // Shown by the dialog through the runs' own errors.
    });
    // A new open, or new steps, is a new preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, actions, installation, targetsKey]);

  useEffect(() => {
    if (isOpen) {
      setSteps(ALL_STEPS);
    }
  }, [isOpen, targetsKey]);

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
  const failed = runs.filter(run => run.error);
  const notConnected = sweeps.notConnected;

  // What Apply runs on: exactly the PRs the preview listed, per team.
  const applyTargets = useMemo(() => {
    const byTeam: Record<string, string[]> = {};
    for (const run of preview) {
      const refs = rowsOf(run.result, run.team).map(row => row.ref);
      if (refs.length > 0) {
        byTeam[run.team] = refs;
      }
    }
    return byTeam;
  }, [preview]);
  const applyCount = Object.values(applyTargets).reduce(
    (sum, refs) => sum + refs.length,
    0,
  );

  const toggleStep = (step: SweepStep, checked: boolean) => {
    setSteps(current =>
      checked
        ? ALL_STEPS.filter(id => id === step || current.includes(id))
        : current.filter(id => id !== step),
    );
  };

  const onConfirm = async () => {
    try {
      await sweeps.run({
        teams: Object.keys(applyTargets),
        prsByTeam: applyTargets,
        actions,
        dryRun: false,
      });
      setApplied(true);
    } catch {
      // Shown by the dialog through the runs' own errors.
    }
  };

  const onePr = targetCount === 1 ? Object.values(prsByTeam)[0][0] : undefined;
  let title = `Sweep ${plural(targetCount, 'PR')} of ${teams[0]}`;
  if (onePr) {
    title = `Sweep ${onePr}`;
  } else if (teams.length > 1) {
    title = `Sweep ${plural(targetCount, 'PR')} across ${plural(
      teams.length,
      'team',
    )}`;
  }
  const confirmLabel = onePr ? 'Apply to this PR' : 'Apply sweep';
  const isPreviewing = sweeps.isPending && sweeps.isDryRun;
  const shown = applied ? outcome : preview;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      confirmLabel={confirmLabel}
      busyLabel="Applying…"
      isBusy={sweeps.isPending && !sweeps.isDryRun}
      isDone={applied}
      isConfirmDisabled={
        sweeps.isPending ||
        applyCount === 0 ||
        steps.length === 0 ||
        Boolean(notConnected)
      }
      onConfirm={onConfirm}
      width="min(92vw, 880px)"
    >
      {!applied ? (
        <Flex direction="column" gap="2">
          <Text variant="body-small" color="secondary">
            The sweep&apos;s steps, in the engine&apos;s order. Every step keeps
            its own guards: unticking one leaves the PR to the others, ticking
            one never forces it. The evidence comment is written on every run.
          </Text>
          <Flex direction="column" gap="1">
            {SWEEP_STEPS.map(step => (
              <Flex key={step.id} gap="2" align="start">
                <Checkbox
                  isSelected={steps.includes(step.id)}
                  isDisabled={sweeps.isPending}
                  onChange={checked => toggleStep(step.id, checked)}
                  aria-label={step.label}
                />
                <Flex direction="column" style={{ minWidth: 0 }}>
                  <Text variant="body-medium">{step.label}</Text>
                  <Text variant="body-small" color="secondary">
                    {step.description}
                  </Text>
                </Flex>
              </Flex>
            ))}
          </Flex>
        </Flex>
      ) : null}
      {notConnected ? (
        <ConnectMargeAlert
          installation={installation}
          message={notConnected.message}
        />
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
          description="The engine ran the sweep as you. What it did to each PR is below, and in each PR's evidence comment."
        />
      ) : null}
      {!applied && !sweeps.isPending && preview.length > 0 ? (
        <Text variant="body-small" color="secondary">
          {onePr
            ? 'What the sweep would do to this PR right now. '
            : 'What the sweep would do to each PR you picked, right now. '}
          {`Apply runs exactly this, on the ${plural(applyCount, 'PR')} listed. To sweep another set, close this and change the ticks in the table.`}
        </Text>
      ) : null}
      {isPreviewing || shown.some(run => run.result) ? (
        <OutcomeTable
          runs={shown}
          isPending={isPreviewing}
          pendingLabel={
            onePr
              ? 'Classifying the PR and deciding what the sweep would do to it.'
              : `Classifying the ${plural(targetCount, 'PR')} you picked.`
          }
          showTeam={teams.length > 1}
        />
      ) : null}
      {applied
        ? null
        : preview.map(({ team, result }) =>
            result?.rules ? (
              <Text key={team} variant="body-small" color="secondary">
                {teams.length > 1 ? `${team}: rule` : 'Rule'} catalogue{' '}
                {result.rules.source}
                {result.rules.digest ? ` (${result.rules.digest})` : ''},{' '}
                {plural(result.rules.loaded, 'rule')} loaded.
              </Text>
            ) : null,
          )}
      {!applied &&
      !sweeps.isPending &&
      preview.length === 0 &&
      failed.length > 0 ? (
        <Text variant="body-small" color="secondary">
          The engine refused the preview. Its reason is above; nothing was
          written.
        </Text>
      ) : null}
    </ConfirmDialog>
  );
}

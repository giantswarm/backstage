import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Flex, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useMargeTeamSweeps } from '../../hooks/useMarge';
import {
  actionsArgument,
  confirmModeOf,
  rowsOf,
  SWEEP_STEPS,
  type ConfirmMode,
  type SweepStep,
} from '../../lib/marge';
import { ConnectMargeAlert } from '../ConnectMargeAlert';
import { OutcomeList } from '../OutcomeList';

export type SweepDialogProps = {
  installation: string;
  /** The teams to sweep, each under its own policy. */
  teams: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** One PR (`OWNER/REPO#NUMBER`) to narrow the sweep to; the whole team without. */
  pr?: string;
  /**
   * The confirm mode the team's policy asks for, when the page knows it from
   * a live read. The preview's own entries carry the policy too and take
   * precedence once they arrive.
   */
  confirmMode?: ConfirmMode;
};

const ALL_STEPS: SweepStep[] = SWEEP_STEPS.map(step => step.id);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Preview, then Apply, for one `x_marge_sweep` per team in view, or for one
 * PR.
 *
 * The steps are the engine's own, every one ticked to begin with, the way a
 * CLI sweep runs them; unticking one narrows `actions` the way `--actions`
 * does, and the preview runs again, because the answer depends on the steps.
 * The preview is the call with `dry_run: true`: a live classification of
 * every PR in scope and the step the engine would take on each. Apply
 * repeats the call without `dry_run`, narrowed with `prs` to exactly the PRs
 * the preview listed -- under a `per-pr` policy on a whole-team run, to the
 * ones the person ticked, none by default -- so a PR that appeared in between
 * is not swept unseen. A refusal is an outcome row with its reason; there is
 * no override to offer, because the engine has none.
 *
 * A team is its own call and its own outcome: one team's refusal leaves the
 * others alone, and the dialog reports each under its name.
 */
export function SweepDialog({
  installation,
  teams,
  isOpen,
  onOpenChange,
  pr,
  confirmMode,
}: SweepDialogProps) {
  const sweeps = useMargeTeamSweeps(installation);
  const [steps, setSteps] = useState<SweepStep[]>(ALL_STEPS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const actions = actionsArgument(steps);
  const teamsKey = teams.join(',');
  const prsByTeam = useMemo(
    () => (pr ? { [teams[0]]: [pr] } : undefined),
    // Keyed on contents: a one-PR sweep is always one team's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pr, teamsKey],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setApplied(false);
    setSelected(new Set());
    sweeps.reset();
    sweeps.run({ teams, prsByTeam, actions, dryRun: true }).catch(() => {
      // Shown by the dialog through the runs' own errors.
    });
    // A new open, or new steps, is a new preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, actions, installation, teamsKey, pr]);

  useEffect(() => {
    if (isOpen) {
      setSteps(ALL_STEPS);
    }
  }, [isOpen, pr]);

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

  // The strictest mode any team in view asks for decides for the dialog: a
  // team that confirms per PR is not confirmed in bulk because another team
  // does not.
  const mode = useMemo(() => {
    // A team that did not answer states no policy: it must not decide how
    // the teams that did answer are confirmed.
    const answered = preview.filter(run => run.result);
    if (answered.length === 0) {
      return confirmMode ?? 'per-pr';
    }
    return answered.some(run => confirmModeOf(run.result) === 'per-pr')
      ? 'per-pr'
      : 'per-sweep';
  }, [preview, confirmMode]);
  const wholeTeam = !pr;
  const selectable = wholeTeam && mode === 'per-pr';

  // What Apply runs on: exactly the PRs the preview listed, per team.
  const applyTargets = useMemo(() => {
    const byTeam: Record<string, string[]> = {};
    for (const run of preview) {
      const refs = rowsOf(run.result, run.team)
        .map(row => row.ref)
        .filter(ref => !selectable || selected.has(ref));
      if (refs.length > 0) {
        byTeam[run.team] = refs;
      }
    }
    return byTeam;
  }, [preview, selectable, selected]);
  const applyCount = Object.values(applyTargets).reduce(
    (sum, refs) => sum + refs.length,
    0,
  );
  const previewRefs = useMemo(
    () =>
      preview.flatMap(run => rowsOf(run.result, run.team).map(row => row.ref)),
    [preview],
  );

  const toggleStep = (step: SweepStep, checked: boolean) => {
    setSteps(current =>
      checked
        ? ALL_STEPS.filter(id => id === step || current.includes(id))
        : current.filter(id => id !== step),
    );
  };

  const onConfirm = async () => {
    if (applied) {
      onOpenChange(false);
      return;
    }
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

  let title = `Sweep team ${teams[0]}`;
  if (pr) {
    title = `Sweep ${pr}`;
  } else if (teams.length > 1) {
    title = `Sweep ${plural(teams.length, 'team')}`;
  }
  let confirmLabel = 'Apply sweep';
  if (applied) {
    confirmLabel = 'Close';
  } else if (pr) {
    confirmLabel = 'Apply to this PR';
  }

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      confirmLabel={confirmLabel}
      busyLabel={sweeps.isDryRun ? 'Previewing…' : 'Applying…'}
      isBusy={sweeps.isPending}
      isConfirmDisabled={
        !applied &&
        (sweeps.isPending ||
          applyCount === 0 ||
          steps.length === 0 ||
          Boolean(notConnected))
      }
      onConfirm={onConfirm}
      width="min(90vw, 760px)"
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
      {sweeps.isPending && sweeps.isDryRun ? (
        <Text variant="body-small" color="secondary">
          {wholeTeam
            ? `Classifying every PR of ${plural(teams.length, 'team')} and deciding what the sweep would do to each. One check read per PR; a whole team takes a few seconds.`
            : 'Classifying the PR and deciding what the sweep would do to it.'}
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
          description="The engine ran the sweep as you. What it did to each PR is below, and in each PR's evidence comment."
        />
      ) : null}
      {!applied && !sweeps.isPending && preview.length > 0 ? (
        <>
          <Text variant="body-small" color="secondary">
            {wholeTeam
              ? `What the sweep would do to each PR of ${teams.join(', ')} right now. `
              : 'What the sweep would do to this PR right now. '}
            {selectable
              ? `The team's policy confirms per PR: tick the PRs the engine may act on. Apply runs on the ${applyCount} ticked.`
              : `Apply runs exactly this, on the ${plural(applyCount, 'PR')} listed.`}
          </Text>
          {selectable ? (
            <Flex gap="2">
              <Button
                variant="tertiary"
                size="small"
                onPress={() => setSelected(new Set(previewRefs))}
              >
                Select all
              </Button>
              <Button
                variant="tertiary"
                size="small"
                onPress={() => setSelected(new Set())}
              >
                Select none
              </Button>
            </Flex>
          ) : null}
        </>
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
            <OutcomeList
              result={run.result!}
              selected={!applied && selectable ? selected : undefined}
              onSelectedChange={
                !applied && selectable ? setSelected : undefined
              }
            />
            {!applied && run.result?.rules ? (
              <Text variant="body-small" color="secondary">
                Rule catalogue {run.result.rules.source}
                {run.result.rules.digest ? ` (${run.result.rules.digest})` : ''}
                , {run.result.rules.loaded} rule
                {run.result.rules.loaded === 1 ? '' : 's'} loaded.
              </Text>
            ) : null}
          </Flex>
        ))}
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

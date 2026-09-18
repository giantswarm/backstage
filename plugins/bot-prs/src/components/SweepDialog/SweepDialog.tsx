import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Flex, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useMargeSweep } from '../../hooks/useMarge';
import {
  actionsArgument,
  confirmModeOf,
  MargeNotConnectedError,
  rowsOf,
  SWEEP_STEPS,
  type ConfirmMode,
  type SweepStep,
} from '../../lib/marge';
import { ConnectMargeAlert } from '../ConnectMargeAlert';
import { OutcomeList } from '../OutcomeList';

export type SweepDialogProps = {
  installation: string;
  team: string;
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

/**
 * Preview, then Apply, for one `x_marge_sweep` call on the team or on one PR.
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
 */
export function SweepDialog({
  installation,
  team,
  isOpen,
  onOpenChange,
  pr,
  confirmMode,
}: SweepDialogProps) {
  const sweep = useMargeSweep(installation, team);
  const [steps, setSteps] = useState<SweepStep[]>(ALL_STEPS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const args = useMemo(
    () => ({
      prs: pr ? [pr] : undefined,
      actions: actionsArgument(steps),
    }),
    [pr, steps],
  );
  const argsKey = JSON.stringify(args);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setApplied(false);
    setSelected(new Set());
    sweep.reset();
    sweep.run({ ...args, dry_run: true }).catch(() => {
      // Shown by the dialog through `sweep.error`.
    });
    // A new open, or new steps, is a new preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, argsKey, installation, team]);

  useEffect(() => {
    if (isOpen) {
      setSteps(ALL_STEPS);
    }
  }, [isOpen, pr]);

  const preview = sweep.isDryRun ? sweep.result : undefined;
  const outcome = !sweep.isDryRun ? sweep.result : undefined;
  const mode = useMemo(
    () => (preview ? confirmModeOf(preview) : (confirmMode ?? 'per-pr')),
    [preview, confirmMode],
  );
  const wholeTeam = !pr;
  const selectable = wholeTeam && mode === 'per-pr';
  const previewRefs = rowsOf(preview).map(row => row.ref);
  const targets = selectable
    ? previewRefs.filter(ref => selected.has(ref))
    : previewRefs;
  const notConnected = sweep.error instanceof MargeNotConnectedError;

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
      await sweep.run({ ...args, prs: targets });
      setApplied(true);
    } catch {
      // Shown by the dialog through `sweep.error`.
    }
  };

  const title = pr ? `Sweep ${pr}` : `Sweep team ${team}`;
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
      busyLabel={sweep.isDryRun ? 'Previewing…' : 'Applying…'}
      isBusy={sweep.isPending}
      isConfirmDisabled={
        !applied &&
        (!preview || targets.length === 0 || steps.length === 0 || notConnected)
      }
      error={sweep.error && !notConnected ? sweep.error.message : undefined}
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
                  isDisabled={sweep.isPending}
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
      {notConnected && sweep.error ? (
        <ConnectMargeAlert
          installation={installation}
          message={sweep.error.message}
        />
      ) : null}
      {sweep.isPending && sweep.isDryRun ? (
        <Text variant="body-small" color="secondary">
          {wholeTeam
            ? 'Classifying every PR of the team and deciding what the sweep would do to each. One check read per PR; a whole team takes a few seconds.'
            : 'Classifying the PR and deciding what the sweep would do to it.'}
        </Text>
      ) : null}
      {applied && outcome ? (
        <>
          <Alert
            status="success"
            title="Applied"
            description={`The engine ran the sweep as you on ${outcome.summary.total} PR${
              outcome.summary.total === 1 ? '' : 's'
            }. What it did to each is below, and in each PR's evidence comment.`}
          />
          <OutcomeList result={outcome} />
        </>
      ) : null}
      {!applied && preview && !sweep.isPending ? (
        <>
          <Text variant="body-small" color="secondary">
            {wholeTeam
              ? `What the sweep would do to each PR of team ${team} right now. `
              : 'What the sweep would do to this PR right now. '}
            {selectable
              ? `The team's policy confirms per PR: tick the PRs the engine may act on. Apply runs on the ${targets.length} ticked.`
              : `Apply runs exactly this, on the ${targets.length} PR${
                  targets.length === 1 ? '' : 's'
                } listed.`}
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
          <OutcomeList
            result={preview}
            selected={selectable ? selected : undefined}
            onSelectedChange={selectable ? setSelected : undefined}
          />
          {preview.rules ? (
            <Text variant="body-small" color="secondary">
              Rule catalogue {preview.rules.source}
              {preview.rules.digest ? ` (${preview.rules.digest})` : ''},{' '}
              {preview.rules.loaded} rule
              {preview.rules.loaded === 1 ? '' : 's'} loaded.
            </Text>
          ) : null}
        </>
      ) : null}
      {!applied &&
      !preview &&
      !sweep.isPending &&
      sweep.error &&
      !notConnected ? (
        <Text variant="body-small" color="secondary">
          The engine refused the preview. Its reason is above; nothing was
          written.
        </Text>
      ) : null}
    </ConfirmDialog>
  );
}

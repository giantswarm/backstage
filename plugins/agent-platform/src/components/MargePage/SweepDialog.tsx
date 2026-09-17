import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import type { MargeSweepArgs } from '../../apis/MargeClient';
import { useMargeSweep } from '../../hooks/useMarge';
import {
  confirmModeOf,
  MargeNotConnectedError,
  rowsOf,
  type ConfirmMode,
} from '../../lib/marge';
import { ConnectMargeAlert } from './ConnectMargeAlert';
import { OutcomeList } from './OutcomeList';

export type SweepDialogProps = {
  installation: string;
  team: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** What the dialog is for: the whole team, or one PR's merge or refresh. */
  title: string;
  /** What Apply does, in the confirm button. */
  confirmLabel: string;
  /**
   * The run, without `team` and without `dry_run`: the preview is this call
   * with `dry_run: true`, Apply is the same call without it.
   */
  args: Omit<MargeSweepArgs, 'team' | 'dry_run'>;
  /**
   * The confirm mode the team's policy asks for, when the page knows it from
   * a live read. The preview's own entries carry the policy too and take
   * precedence once they arrive.
   */
  confirmMode?: ConfirmMode;
  /** Called once a run that wrote has finished, with its result shown. */
  onApplied?: () => void;
};

/**
 * Preview, then Apply, for one `x_marge_sweep` call.
 *
 * The preview runs when the dialog opens: the same call with `dry_run: true`,
 * a live classification of every PR in scope and the step the engine would
 * take on each. Apply repeats the call without `dry_run`, narrowed with `prs`
 * to exactly the PRs the preview listed -- or, under a `per-pr` policy on a
 * whole-team run, to the ones the person ticked, none by default -- so a PR that appeared in
 * between is not swept unseen. A refusal is an outcome row with its reason;
 * there is no override to offer, because the engine has none.
 */
export function SweepDialog({
  installation,
  team,
  isOpen,
  onOpenChange,
  title,
  confirmLabel,
  args,
  confirmMode,
  onApplied,
}: SweepDialogProps) {
  const sweep = useMargeSweep(installation, team);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const argsKey = JSON.stringify(args);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setApplied(false);
    sweep.reset();
    setSelected(new Set());
    sweep.run({ ...args, dry_run: true }).catch(() => {
      // Shown by the dialog through `sweep.error`.
    });
    // A new open, or new arguments, is a new preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, argsKey, installation, team]);

  const preview = sweep.isDryRun ? sweep.result : undefined;
  const outcome = !sweep.isDryRun ? sweep.result : undefined;
  const mode = useMemo(
    () => (preview ? confirmModeOf(preview) : (confirmMode ?? 'per-pr')),
    [preview, confirmMode],
  );
  const wholeTeam = !args.prs || args.prs.length === 0;
  const selectable = wholeTeam && mode === 'per-pr';
  const previewRefs = rowsOf(preview).map(row => row.ref);
  const targets = selectable
    ? previewRefs.filter(ref => selected.has(ref))
    : previewRefs;

  const onConfirm = async () => {
    if (applied) {
      onOpenChange(false);
      return;
    }
    try {
      await sweep.run({ ...args, prs: targets });
      setApplied(true);
      onApplied?.();
    } catch {
      // Shown by the dialog through `sweep.error`.
    }
  };

  const notConnected = sweep.error instanceof MargeNotConnectedError;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      confirmLabel={applied ? 'Close' : confirmLabel}
      busyLabel={sweep.isDryRun ? 'Previewing…' : 'Applying…'}
      isBusy={sweep.isPending}
      isConfirmDisabled={
        !applied && (!preview || targets.length === 0 || notConnected)
      }
      error={sweep.error && !notConnected ? sweep.error.message : undefined}
      onConfirm={onConfirm}
      width="min(90vw, 720px)"
    >
      {notConnected && sweep.error ? (
        <ConnectMargeAlert
          installation={installation}
          message={sweep.error.message}
        />
      ) : null}
      {sweep.isPending && sweep.isDryRun ? (
        <Text variant="body-small" color="secondary">
          {wholeTeam
            ? 'Classifying every PR of the team and deciding what the sweep would do. One check read per PR; a whole team takes a few seconds.'
            : 'Classifying the PR and deciding what the engine would do to it.'}
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
      {!applied && preview ? (
        <>
          <Text variant="body-small" color="secondary">
            {wholeTeam
              ? `What a sweep would do to each PR of team ${team} right now. `
              : 'What the engine would do to this PR right now. '}
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

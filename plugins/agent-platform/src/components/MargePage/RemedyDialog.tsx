import { useEffect, useState } from 'react';
import { Alert, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useMargeRemedy } from '../../hooks/useMarge';
import { MargeNotConnectedError, rowsOf, type BotPrRow } from '../../lib/marge';
import { ConnectMargeAlert } from './ConnectMargeAlert';
import { OutcomeList } from './OutcomeList';

export type RemedyDialogProps = {
  installation: string;
  team: string;
  row: BotPrRow | undefined;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onApplied?: () => void;
};

/**
 * `x_marge_remedy` on one PR: the catalogue rule that matches its failure,
 * applied through that rule's action and the action's own guards.
 *
 * There is no "rerun" button on the page on purpose. A rerun is one remedy
 * action a rule can name, and whether this failure wants one is the rule's
 * decision under its guards; a button that reran directly would route around
 * them. So the dialog previews the rule that would apply (`dry_run: true`),
 * and Apply lets the engine take that step as the person. No rule matching
 * means nothing is written and the failure is reported under unhandled.
 */
export function RemedyDialog({
  installation,
  team,
  row,
  isOpen,
  onOpenChange,
  onApplied,
}: RemedyDialogProps) {
  const remedy = useMargeRemedy(installation, team);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!isOpen || !row) {
      return;
    }
    setApplied(false);
    remedy.reset();
    remedy.run({ pr_url: row.ref, dry_run: true }).catch(() => {
      // Shown by the dialog through `remedy.error`.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, row?.ref, installation, team]);

  const preview = remedy.isDryRun ? remedy.result : undefined;
  const outcome = !remedy.isDryRun ? remedy.result : undefined;
  // A dry run leaves the PR in its class and says what it would do in the
  // evidence line (`dry-run: rule <name> would apply <action>`); a real run
  // files the PR under remedied.
  const remedied =
    (preview?.remedied ?? []).length > 0 ||
    rowsOf(preview).some(entry =>
      /dry-run: rule .+ would apply/.test(entry.detail ?? ''),
    );
  const notConnected = remedy.error instanceof MargeNotConnectedError;

  const onConfirm = async () => {
    if (applied || !row) {
      onOpenChange(false);
      return;
    }
    try {
      await remedy.run({ pr_url: row.ref });
      setApplied(true);
      onApplied?.();
    } catch {
      // Shown by the dialog through `remedy.error`.
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={row ? `Remedy ${row.ref}` : 'Remedy'}
      confirmLabel={applied ? 'Close' : 'Apply remedy'}
      busyLabel={remedy.isDryRun ? 'Previewing…' : 'Applying…'}
      isBusy={remedy.isPending}
      isConfirmDisabled={!applied && (!preview || !remedied || notConnected)}
      error={remedy.error && !notConnected ? remedy.error.message : undefined}
      onConfirm={onConfirm}
      width="min(90vw, 720px)"
    >
      {notConnected && remedy.error ? (
        <ConnectMargeAlert
          installation={installation}
          message={remedy.error.message}
        />
      ) : null}
      {remedy.isPending && remedy.isDryRun ? (
        <Text variant="body-small" color="secondary">
          Classifying the PR and letting the rule catalogue compete for it.
        </Text>
      ) : null}
      {applied && outcome ? (
        <>
          <Alert
            status="success"
            title="Applied"
            description="The engine took the rule's step as you. The evidence comment on the PR records it."
          />
          <OutcomeList result={outcome} />
        </>
      ) : null}
      {!applied && preview ? (
        <>
          <Text variant="body-small" color="secondary">
            {remedied
              ? 'The rule below matches this PR. Apply lets the engine take its action, under that action’s guards.'
              : 'No rule of the catalogue would act on this PR right now. The engine’s reason is below, and there is nothing to apply.'}
          </Text>
          <OutcomeList result={preview} />
        </>
      ) : null}
    </ConfirmDialog>
  );
}

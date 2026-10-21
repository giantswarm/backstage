import { useMemo, useState } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import {
  ConfirmDialog,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCommitAgentUpdateDryRun } from '../../hooks/useCommitAgentUpdateDryRun';
import { useHarnessChoices } from '../../hooks/useHarnessChoices';
import { useValidateAgentUpdate } from '../../hooks/useValidateAgentUpdate';
import type { UpdateAgentState } from '../../hooks/useUpdateAgent';
import {
  missingReleaseFile,
  type AgentUpdate,
  type CommitAgentResult,
  type WriteMode,
} from '../../lib/agentManager';
import { harnessTitle, type HarnessChoice } from '../../lib/harnesses';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { MissingReleaseFileAlert } from '../MissingReleaseFileAlert';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  // Holds the line under the cards at the loading indicator's height, so the
  // indicator, the note that replaces it, or nothing do not move the dialog.
  status: {
    minHeight: theme.spacing(5),
  },
  violations: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
  },
}));

export type AgentChangeHarnessDialogProps = {
  installation: string;
  namespace: string;
  name: string;
  displayName: string;
  /** The Agent's `spec.harnessRef.name`; undefined runs on the platform one. */
  currentHarness?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /**
   * `apply` moves the agent live; `commit`, for an agent applied from git,
   * opens a pull request as the person instead. Fixed by the page when it
   * opens the dialog.
   */
  mode?: WriteMode;
  /** The page's `useUpdateAgent`, shared with Update skills and Edit. */
  updating: UpdateAgentState;
  /** The agent's edit page, where a refused check is fixed. */
  editHref?: string;
  /**
   * Called after the live write landed, with the Harness titles before and
   * after. `fromGeneration` lets the page wait for this write's revision.
   */
  onChanged: (
    from: string,
    to: string,
    requestedBy?: string,
    fromGeneration?: number,
  ) => void;
};

function choiceOrName(choices: HarnessChoice[], name: string): HarnessChoice {
  return (
    choices.find(choice => choice.name === name) ?? {
      name,
      displayName: name,
    }
  );
}

/**
 * "Change Harness": move the agent to another Harness of its namespace (D9).
 *
 * The namespace's Harnesses are listed with the current one shown and not
 * pickable. Picking another asks agent-manager for the dry run
 * (`validate_agent` with `update: true` and `harness`), which runs the checks
 * a create on that Harness runs; every refusal is listed, the change is
 * blocked, and the edit page is linked to fix what was refused. Confirming
 * calls `update_agent` with `harness` and nothing else.
 *
 * Running Sessions keep the revision they were prepared on, so they stay on
 * the current runtime until deleted; the dialog says so before the change.
 * For an agent applied from git (`mode: commit`) the change goes through a
 * pull request, as in the Update skills dialog.
 */
export function AgentChangeHarnessDialog({
  installation,
  namespace,
  name,
  displayName,
  currentHarness,
  isOpen,
  onOpenChange,
  mode = 'apply',
  updating,
  editHref,
  onChanged,
}: AgentChangeHarnessDialogProps) {
  const classes = useStyles();
  const cardClasses = useSelectableCardStyles();
  const {
    choices,
    platformHarness,
    errors: listErrors,
    isLoading: isListing,
  } = useHarnessChoices(isOpen ? installation : undefined, namespace);
  const currentName = currentHarness ?? platformHarness;
  const [selected, setSelected] = useState<string>();
  const [commitResult, setCommitResult] = useState<CommitAgentResult>();
  const isCommitted = commitResult?.commit !== undefined;
  const viaPullRequest = mode === 'commit';

  const change = useMemo<AgentUpdate | undefined>(
    () =>
      isOpen && selected ? { namespace, name, harness: selected } : undefined,
    [isOpen, selected, namespace, name],
  );
  const validated = useValidateAgentUpdate(installation, change, mode);
  const violations = validated.result?.errors ?? [];
  const failure = validated.failure;

  const opensPullRequest =
    viaPullRequest &&
    Boolean(validated.result) &&
    !failure &&
    violations.length === 0;
  const commitDryRun = useCommitAgentUpdateDryRun(
    installation,
    opensPullRequest ? change : undefined,
  );
  const missing =
    missingReleaseFile(commitDryRun.failure) ??
    missingReleaseFile(updating.failure);

  const notConnected =
    failure?.kind === 'not-connected' ||
    updating.failure?.kind === 'not-connected';
  const isChecking = validated.isLoading || commitDryRun.isLoading;
  const isRefused = Boolean(failure) || violations.length > 0;

  const current = choiceOrName(choices, currentName);
  const target = selected ? choiceOrName(choices, selected) : undefined;
  const others = choices.filter(choice => choice.name !== currentName);

  const canConfirm =
    Boolean(target) &&
    Boolean(validated.result) &&
    !isChecking &&
    !isRefused &&
    !missing &&
    !isCommitted;

  const onConfirm = async () => {
    if (!canConfirm || !selected || !target) {
      return;
    }
    if (viaPullRequest) {
      updating.reset();
      try {
        setCommitResult(
          await updating.commit({ namespace, name, harness: selected }),
        );
      } catch {
        // Left to the dialog, which stays open and shows agent-manager's message.
      }
      return;
    }
    let result;
    try {
      result = await updating.update({ namespace, name, harness: selected });
    } catch {
      // Left to the dialog, which stays open and shows agent-manager's message.
      return;
    }
    onOpenChange(false);
    onChanged(
      harnessTitle(current),
      harnessTitle(target),
      result.requestedBy,
      result.fromGeneration,
    );
  };

  const cardContent = (choice: HarnessChoice) => (
    <>
      <Text weight="bold">{harnessTitle(choice)}</Text>
      {choice.name === currentName && (
        <Text variant="body-small" color="secondary">
          Current runtime
        </Text>
      )}
      <Text variant="body-x-small" color="secondary">
        Harness <span className={cardClasses.code}>{choice.name}</span>
        {choice.imageName && (
          <>
            {' · '}
            <span className={cardClasses.code}>{choice.imageName}</span>
          </>
        )}
      </Text>
    </>
  );

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={isOpenNow => {
        if (!isOpenNow) {
          updating.reset();
          setSelected(undefined);
          setCommitResult(undefined);
        }
        onOpenChange(isOpenNow);
      }}
      title={`Change the Harness of "${displayName}"?`}
      confirmLabel={viaPullRequest ? 'Open pull request' : 'Change Harness'}
      busyLabel={viaPullRequest ? 'Opening pull request…' : 'Changing…'}
      isBusy={updating.isUpdating || updating.isCommitting}
      isDone={isCommitted || Boolean(missing)}
      isConfirmDisabled={!canConfirm}
      error={
        updating.failure && !notConnected && !missing
          ? updating.failure.message
          : undefined
      }
      onConfirm={onConfirm}
      width="min(90vw, 720px)"
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium">
          The agent keeps its name, address and Sessions. Running Sessions stay
          on {harnessTitle(current)} until you delete them; new Sessions start
          on {target ? harnessTitle(target) : 'the new runtime'} once its
          revision is Ready.
        </Text>
        {viaPullRequest && !missing && (
          <Text variant="body-medium">
            This agent is applied from GitOps, so agent-manager opens a pull
            request as you. The agent moves once it is merged.
          </Text>
        )}

        {listErrors.length > 0 && (
          <Alert
            status="warning"
            title="Could not read some runtimes, so the list may be incomplete."
          />
        )}
        {isListing && choices.length === 0 && (
          <Text color="secondary">Loading runtimes…</Text>
        )}
        {!isListing && others.length === 0 && listErrors.length === 0 && (
          <Text variant="body-small" color="secondary">
            {namespace} has no other Harness to move this agent to.
          </Text>
        )}
        {choices.length > 0 && (
          <SelectableCardGrid
            role="radiogroup"
            ariaLabel="Runtime"
            minWidth={220}
          >
            {choices.map(choice => (
              <SelectableCard
                key={choice.name}
                role="radio"
                selected={choice.name === (selected ?? currentName)}
                disabled={choice.name === currentName || isCommitted}
                ariaLabel={`${harnessTitle(choice)}, Harness ${choice.name}${
                  choice.name === currentName ? ', current runtime' : ''
                }`}
                onSelect={() => {
                  updating.reset();
                  setSelected(choice.name);
                }}
              >
                {cardContent(choice)}
              </SelectableCard>
            ))}
          </SelectableCardGrid>
        )}

        {failure?.kind === 'not-connected' && (
          <ConnectAgentManagerAlert
            installation={installation}
            message={failure.message}
            action="The Harness is changed"
          />
        )}
        {failure && failure.kind !== 'not-connected' && (
          <Alert
            status="danger"
            title={
              failure.kind === 'refused'
                ? 'agent-manager refuses the change'
                : 'Could not reach agent-manager'
            }
            description={failure.message}
          />
        )}
        {violations.length > 0 && target && (
          <Alert
            status="danger"
            title={`${harnessTitle(target)} refuses this agent`}
            description={
              <Flex direction="column" gap="2">
                <ul className={classes.violations} aria-label="Violations">
                  {violations.map(violation => (
                    <li key={violation}>{violation}</li>
                  ))}
                </ul>
                {editHref && (
                  <Text variant="body-small">
                    <Link to={editHref}>Edit the agent</Link> to fix this, then
                    change its Harness.
                  </Text>
                )}
              </Flex>
            }
          />
        )}

        <div className={classes.status}>
          {missing && <MissingReleaseFileAlert missing={missing} />}
          {isChecking && (
            <LoadingIndicator
              label={
                validated.isLoading
                  ? `Asking agent-manager whether ${
                      target ? harnessTitle(target) : 'the Harness'
                    } takes this agent…`
                  : 'Asking agent-manager whether it can open the pull request…'
              }
            />
          )}
          {canConfirm && target && (
            <Text variant="body-small" color="secondary">
              {viaPullRequest
                ? `Confirming opens a pull request moving the agent to ${harnessTitle(
                    target,
                  )}.`
                : `Every check passes. Confirming moves the agent to ${harnessTitle(
                    target,
                  )}; its Harness then compiles a new revision.`}
            </Text>
          )}
        </div>

        {commitResult && <CommitOutcome result={commitResult} />}
      </Flex>
    </ConfirmDialog>
  );
}

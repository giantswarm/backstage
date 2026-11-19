import { Flex, Text } from '@backstage/ui';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import {
  CONTENT_PULL_REQUEST_NEXT,
  CONTENT_PULL_REQUEST_UNCHANGED,
} from '../../lib/organizations';
import {
  PullRequestOutcome,
  type PullRequestCommit,
} from '../PullRequestOutcome';

export type ModelDeleteDialogProps = {
  modelConfig: ModelConfig;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isDeleting: boolean;
  error?: string;
  onConfirm: () => void;
  /**
   * The pull request the delete opened, in mode commit: the dialog stays
   * with it, and the model stays until it is merged.
   */
  pullRequest?: PullRequestCommit;
};

/**
 * Asks before deleting a model.
 *
 * Says one thing, because it is the only thing the person clicking cannot
 * work out for themselves: from here on, nobody can create an agent on this
 * model any more. Agents that still *use* it are not at risk — the mutation
 * refuses to delete a referenced model outright, and that refusal (with the
 * agent names) renders in this dialog's error slot.
 */
export function ModelDeleteDialog({
  modelConfig,
  isOpen,
  onOpenChange,
  isDeleting,
  error,
  onConfirm,
  pullRequest,
}: ModelDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete model "${modelConfig.getDisplayName()}"?`}
      destructive
      confirmLabel="Delete model"
      busyLabel="Deleting…"
      isBusy={isDeleting}
      isDone={Boolean(pullRequest)}
      error={error}
      onConfirm={onConfirm}
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium">
          It leaves the picker, so no new agents can use it. Its stored
          credential stays, since another model or connector may use it.
        </Text>
        {pullRequest && (
          <PullRequestOutcome
            commit={pullRequest}
            next={CONTENT_PULL_REQUEST_NEXT}
            unchanged={CONTENT_PULL_REQUEST_UNCHANGED}
            testId="model-delete-pull-request"
          />
        )}
      </Flex>
    </ConfirmDialog>
  );
}

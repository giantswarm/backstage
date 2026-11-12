import { useState } from 'react';
import { Alert, Flex, Text, TextField } from '@backstage/ui';
import {
  ConfirmDialog,
  ExternalButtonLink,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { classifyCommitFailure } from '../../hooks/useAgentCommitCheck';
import { classifyReadFailure } from '../../hooks/useAgentManagerAgent';
import {
  useOrganizationDeletion,
  useOrganizationErasure,
} from '../../hooks/useOrganization';
import type {
  OrganizationCommit,
  OrganizationDeleteMode,
  OrganizationErasure,
} from '../../lib/organizations';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';

export type OrganizationDeleteDialogProps = {
  installation: string;
  parent: string;
  name: string;
  /** The display name, else the name. */
  title: string;
  mode: OrganizationDeleteMode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** What the erasure takes, one line per kind that has something. */
function ErasureList({ erasure }: { erasure: OrganizationErasure }) {
  const lines: [string, string[]][] = [
    ['Agents', erasure.agents],
    ['Connectors', erasure.connectors],
    ['Models', erasure.models],
    ['Egress policies', erasure.egressPolicies],
    ['Credentials', erasure.credentials],
    ['Member bindings', erasure.members],
  ];
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-medium" weight="bold">
        This erases
      </Text>
      <ul aria-label="What the erasure takes" style={{ margin: 0 }}>
        {lines.map(([label, items]) => (
          <li key={label}>
            <Text variant="body-medium">
              {label}: {items.length === 0 ? 'none' : items.join(', ')}
            </Text>
          </li>
        ))}
        <li>
          <Text variant="body-medium">
            Worker snapshots and connector sign-ins
          </Text>
        </li>
      </ul>
      {(erasure.unreadable ?? []).length > 0 && (
        <Alert
          status="warning"
          title="Some of it could not be read as you"
          description={(erasure.unreadable ?? []).join('; ')}
        />
      )}
    </Flex>
  );
}

/** The running sessions the erasure stops, or why they are unknown. */
function RunningSessions({ erasure }: { erasure: OrganizationErasure }) {
  if (erasure.sessions === null) {
    return (
      <Text variant="body-medium">
        Running sessions: unknown.{' '}
        {erasure.sessionsUnavailable &&
          `agent-manager could not count them: ${erasure.sessionsUnavailable}.`}
      </Text>
    );
  }
  const running = erasure.sessions.filter(agent => agent.running > 0);
  const total = running.reduce((sum, agent) => sum + agent.running, 0);
  if (total === 0) {
    return <Text variant="body-medium">Running sessions: none.</Text>;
  }
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-medium">
        Running sessions: {total} (they stop, including other people's).
      </Text>
      <ul aria-label="Running sessions per agent" style={{ margin: 0 }}>
        {running.map(agent => (
          <li key={agent.agent}>
            <Text variant="body-medium">
              {agent.agent}: {plural(agent.running, 'session')}
            </Text>
          </li>
        ))}
      </ul>
    </Flex>
  );
}

function PullRequestOutcome({ commit }: { commit: OrganizationCommit }) {
  if (!commit.pullRequest) {
    return (
      <Alert
        status="info"
        title="Nothing to commit"
        description="git already says the organization is deleted."
      />
    );
  }
  return (
    <Alert
      status="success"
      data-testid="organization-delete-pull-request"
      title={`Pull request${commit.number ? ` #${commit.number}` : ''} opened${
        commit.author ? ` as ${commit.author}` : ''
      }`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small" style={{ overflowWrap: 'anywhere' }}>
            {commit.repository} on {commit.base}. Once it is merged, the
            organization shows Pending erase, and Erase now erases it.
          </Text>
          {commit.review && (
            <Text variant="body-small">Review: {commit.review}.</Text>
          )}
          <div>
            <ExternalButtonLink
              href={commit.pullRequest}
              variant="secondary"
              size="small"
            >
              Review pull request
            </ExternalButtonLink>
          </div>
        </Flex>
      }
    />
  );
}

/**
 * Asks before deleting an organization, with what agent-manager says the
 * delete erases now and the running sessions it stops. An erase, live or
 * once the delete pull request merged, cannot be undone, so it waits for the
 * person to type `parent/name`; agent-manager checks that name again. A
 * delete of an organization applied from git only opens the pull request
 * that removes it, which can be closed unmerged, so it asks no name.
 */
export function OrganizationDeleteDialog({
  installation,
  parent,
  name,
  title,
  mode,
  isOpen,
  onOpenChange,
}: OrganizationDeleteDialogProps) {
  const erasure = useOrganizationErasure(installation, parent, name);
  const deletion = useOrganizationDeletion(installation, parent, name);
  const [typed, setTyped] = useState('');

  const expected = `${parent}/${name}`;
  const viaPullRequest = mode === 'pull-request';
  const erases = erasure.data?.erases;
  const failure = deletion.error
    ? classifyCommitFailure(classifyReadFailure(deletion.error))
    : undefined;
  const connect = failure?.kind === 'connect' ? failure : undefined;
  const pullRequest = viaPullRequest ? deletion.data?.commit : undefined;
  // Neither a pull request nor an erase: agent-manager says why in `next`,
  // as when the delete pull request is open already or the organization is
  // being erased.
  const unchanged =
    deletion.data && !deletion.data.commit && !deletion.data.deleted
      ? deletion.data
      : undefined;

  let confirmLabel = 'Erase organization';
  if (viaPullRequest) {
    confirmLabel = 'Open pull request';
  } else if (mode === 'delete') {
    confirmLabel = 'Delete organization';
  }

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) {
          deletion.reset();
          setTyped('');
        }
        onOpenChange(open);
      }}
      title={
        mode === 'erase'
          ? `Erase organization "${title}"?`
          : `Delete organization "${title}"?`
      }
      // A pull request can be closed unmerged; an erase cannot be undone.
      destructive={!viaPullRequest}
      confirmLabel={confirmLabel}
      busyLabel={viaPullRequest ? 'Opening pull request…' : 'Erasing…'}
      isBusy={deletion.isPending}
      isConfirmDisabled={
        erasure.isLoading ||
        Boolean(erasure.failure) ||
        Boolean(connect) ||
        (!viaPullRequest && typed !== expected)
      }
      isDone={Boolean(pullRequest || unchanged)}
      error={
        failure?.kind === 'other' || failure?.kind === 'release-outside'
          ? failure.message
          : undefined
      }
      onConfirm={() =>
        deletion.mutate(
          { mode, ...(viaPullRequest ? {} : { confirm: typed }) },
          {
            onSuccess: result => {
              if (!viaPullRequest && result.deleted) {
                onOpenChange(false);
              }
            },
          },
        )
      }
    >
      <Flex direction="column" gap="3">
        {viaPullRequest && !pullRequest && (
          <Text variant="body-medium">
            This organization is applied from git, so agent-manager opens a pull
            request as you that removes it. Its workers stop once the pull
            request is merged; it is erased only when you then choose Erase now.
          </Text>
        )}
        {erasure.isLoading && (
          <LoadingIndicator label="Asking agent-manager what the delete erases…" />
        )}
        {erasure.failure && (
          <Alert
            status="warning"
            title="Could not read what the delete erases"
            description={erasure.failure.message}
          />
        )}
        {erases && !pullRequest && (
          <>
            <ErasureList erasure={erases} />
            <Text variant="body-medium">Kept: {erases.kept}.</Text>
            <RunningSessions erasure={erases} />
          </>
        )}
        {!viaPullRequest && (
          <TextField
            label={`Type ${expected} to confirm`}
            value={typed}
            onChange={setTyped}
            isDisabled={deletion.isPending}
            autoComplete="off"
          />
        )}
        {connect && (
          <ConnectAgentManagerAlert
            installation={installation}
            message={connect.message}
            signInRequired={connect.signInRequired}
            action="Organizations are deleted"
            needsGitHub={connect.github}
            onSignedIn={deletion.reset}
          />
        )}
        {pullRequest && <PullRequestOutcome commit={pullRequest} />}
        {unchanged && (
          <Alert
            status="info"
            data-testid="organization-delete-unchanged"
            title="Nothing was deleted"
            description={
              <Text variant="body-small" style={{ overflowWrap: 'anywhere' }}>
                {unchanged.next ?? 'agent-manager gave no reason.'}
              </Text>
            }
          />
        )}
      </Flex>
    </ConfirmDialog>
  );
}

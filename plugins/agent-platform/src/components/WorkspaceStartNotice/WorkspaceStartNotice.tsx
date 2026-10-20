import { Alert, Button, Flex, Text } from '@backstage/ui';

import { useWorkspaceProviders } from '../../hooks/useWorkspaceEditor';
import { useWorkspaceManagerClient } from '../../hooks/useWorkspaceManager';
import {
  providerDisplayName,
  providerKindName,
  WorkspaceManagerError,
  type ProviderConnect,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';
import { repositoryNoun } from '../WorkspaceEditorPage/repositoryNoun';
import { ProviderConnectAction } from '../ProviderConnectPrompt';

export type WorkspaceStartNoticeProps = {
  /** The agent's installation, whose muster holds the person's grants. */
  installation: string;
  /** The workspace the start was asked in. */
  workspace: string;
  /** The workspace's repository count at its last sync, for the wait. */
  repositories?: number;
  /** The start is under way: the access check, then the session. */
  isStarting: boolean;
  /** Why the last start failed; only a workspace's answer is said here. */
  error?: unknown;
  /** Starts again: same prompt, agent and workspace, same request. */
  onRetry: () => void;
  /** Starts the same prompt without the workspace. */
  onStartWithout: () => void;
};

/**
 * What a start in a workspace says above the composer, per the WsTStart
 * board: the access check while it runs; a sign-in card for each provider
 * whose App the person has not granted (`connect_required`), after which the
 * start goes again by itself; or the refusal, naming the workspace and every
 * repository the person cannot read, or why the workspace cannot be started
 * on yet. The prompt stays in the box below throughout. Nothing for any other
 * error, which the composer says as before.
 */
export function WorkspaceStartNotice({
  installation,
  workspace,
  repositories,
  isStarting,
  error,
  onRetry,
  onStartWithout,
}: WorkspaceStartNoticeProps) {
  if (isStarting) {
    return (
      <Alert
        status="info"
        isPending
        role="status"
        aria-live="polite"
        title={`Checking access to ${workspace}…`}
        description={
          repositories
            ? `Then your directory is prepared: ${repositories} ${repositoryNoun(
                undefined,
                repositories,
              )}. Seconds.`
            : undefined
        }
      />
    );
  }
  if (!(error instanceof WorkspaceManagerError)) {
    return null;
  }
  if (error.kind === 'not_connected' && error.connect.length > 0) {
    return (
      <ConnectCards
        installation={installation}
        workspace={workspace}
        connect={error.connect}
        onRetry={onRetry}
        onStartWithout={onStartWithout}
      />
    );
  }
  if (error.kind === 'refused') {
    const count = error.repositories.length;
    return (
      <Alert
        status="danger"
        role="alert"
        title={
          count > 0
            ? `You cannot read ${count} ${repositoryNoun(
                undefined,
                count,
              )} of ${workspace}`
            : `${workspace} cannot be used yet`
        }
        description={
          <Flex direction="column" gap="2">
            <Text variant="body-small">
              {count > 0
                ? `The session was not started: its agent would read ${workspace} as you, and you have no access to ${error.repositories.join(
                    ', ',
                  )}. Ask its owner for access, or start without the workspace.`
                : `The session was not started. ${error.message}`}
            </Text>
            <div>
              <Button variant="secondary" size="small" onPress={onStartWithout}>
                Start without workspace
              </Button>
            </div>
          </Flex>
        }
      />
    );
  }
  return null;
}

/**
 * One card per provider to grant: the provider's kind comes from
 * `list_providers`, the instance's name alone until it answers.
 */
function ConnectCards({
  installation,
  workspace,
  connect,
  onRetry,
  onStartWithout,
}: {
  installation: string;
  workspace: string;
  connect: ProviderConnect[];
  onRetry: () => void;
  onStartWithout: () => void;
}) {
  const client = useWorkspaceManagerClient(installation);
  const providers = useWorkspaceProviders(client);
  return (
    <Flex direction="column" gap="2">
      {connect.map(entry => {
        const known = providers.data?.find(p => p.name === entry.provider);
        const provider: WorkspaceProvider = {
          name: entry.provider,
          kind: known?.kind ?? '',
          host: known?.host,
          connected: false,
          signIn: entry.signIn,
        };
        const kind = providerKindName(provider.kind);
        const noun = repositoryNoun(provider.kind, 2);
        return (
          <Alert
            key={entry.provider}
            status="info"
            role="alert"
            data-testid={`workspace-connect-${entry.provider}`}
            title={`Sign in to ${providerDisplayName(
              provider,
            )} to use ${workspace}`}
            description={
              <Flex direction="column" gap="2">
                <Text variant="body-small">
                  {`The agent works in this workspace's ${
                    kind ? `${kind} ` : ''
                  }${noun} as you. It is the same one-time sign-in as in the workspace editor; your prompt stays here.`}
                </Text>
                <Flex gap="2" align="start" style={{ flexWrap: 'wrap' }}>
                  <ProviderConnectAction
                    installation={installation}
                    provider={provider}
                    onRecheck={onRetry}
                    waitingNote="Finish in the other tab. The session starts as soon as you are back."
                  />
                  <Button
                    variant="tertiary"
                    size="small"
                    onPress={onStartWithout}
                  >
                    Start without workspace
                  </Button>
                </Flex>
              </Flex>
            }
          />
        );
      })}
    </Flex>
  );
}

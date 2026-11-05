import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';

import { useWorkspaceProviders } from '../../hooks/useWorkspaceEditor';
import { useWorkspaceManagerClient } from '../../hooks/useWorkspaceManager';
import {
  providerDisplayName,
  providerKindName,
  providerSignInTarget,
  WorkspaceManagerError,
  type ProviderConnect,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';
import { repositoryNoun } from '../WorkspaceEditorPage/repositoryNoun';
import { ProviderConnectPrompt } from '../ProviderConnectPrompt';

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
                  )}. Ask an owner of these repositories for access, or start without the workspace.`
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
 * One {@link ProviderConnectPrompt} per provider to grant, each connecting on
 * its own: the provider's kind comes from `list_providers`, the instance's
 * name alone until it answers. Once the person has signed in to every one the
 * portal can start a grant for, the start goes again by itself, with the
 * prompt still in the box below.
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
  // Only a sign-in the person makes here restarts the start: an entry with no
  // grant the portal can start waits for its platform team, not for a retry.
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const startable = connect.filter(entry => providerSignInTarget(entry.signIn));
  const allGranted =
    startable.length > 0 &&
    startable.every(entry => granted.has(entry.provider));
  const retried = useRef(false);
  useEffect(() => {
    if (allGranted && !retried.current) {
      retried.current = true;
      onRetry();
    }
  }, [allGranted, onRetry]);
  return (
    <Flex direction="column" gap="2" role="alert">
      {allGranted && (
        // The start goes again by itself; should it not get under way (the
        // prompt was emptied meanwhile), the person starts it.
        <div>
          <Button variant="primary" size="small" onPress={onRetry}>
            Start the session
          </Button>
        </div>
      )}
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
          <ProviderConnectPrompt
            key={entry.provider}
            installation={installation}
            provider={provider}
            title={`Sign in to ${providerDisplayName(
              provider,
            )} to use ${workspace}`}
            lead={`The agent works in this workspace's ${
              kind ? `${kind} ` : ''
            }${noun} as you. It is the same one-time sign-in as in the workspace editor; your prompt stays here.`}
            waitingNote={
              connect.length > 1
                ? 'Finish in the other tab. The session starts once every provider above is signed in.'
                : 'Finish in the other tab. The session starts as soon as you are back.'
            }
            onConnected={() =>
              setGranted(prev => new Set(prev).add(entry.provider))
            }
            actions={
              <Button variant="tertiary" size="small" onPress={onStartWithout}>
                Start without workspace
              </Button>
            }
          />
        );
      })}
    </Flex>
  );
}

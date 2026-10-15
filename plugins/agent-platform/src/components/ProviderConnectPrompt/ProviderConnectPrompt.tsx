import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';

import type { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import {
  classifyWorkspaceManagerError,
  providerDisplayName,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';

export type ProviderConnectPromptProps = {
  client: WorkspaceManagerClient;
  /** A provider instance the person has not connected, from `list_providers`. */
  provider: WorkspaceProvider;
  /**
   * Reads `list_providers` again; called when the window regains focus after
   * Connect, so the host sees the new state and carries on with its draft.
   */
  onRecheck: () => void;
};

/**
 * The inline sign-in for a provider instance the person has not connected:
 * what connecting means, and {@link ProviderConnectAction}.
 */
export function ProviderConnectPrompt({
  client,
  provider,
  onRecheck,
}: ProviderConnectPromptProps) {
  const label = providerDisplayName(provider);
  return (
    <Alert
      status="info"
      data-testid={`provider-connect-${provider.name}`}
      title={`Connect ${label}`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            Agents read and push to {label} as you, with your own sign-in.
          </Text>
          <ProviderConnectAction
            client={client}
            provider={provider}
            onRecheck={onRecheck}
          />
        </Flex>
      }
    />
  );
}

/**
 * Connect, which opens the person's own sign-in link (`connect_provider`) at
 * workspace-manager in a new tab, and what happens while it is open. No token
 * or code passes through the portal; when the tab hands focus back the
 * host's provider list is read again.
 */
export function ProviderConnectAction({
  client,
  provider,
  onRecheck,
}: ProviderConnectPromptProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const label = providerDisplayName(provider);

  useEffect(() => {
    if (!isWaiting) {
      return undefined;
    }
    const onFocus = () => onRecheck();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isWaiting, onRecheck]);

  const connect = useCallback(async () => {
    setError(undefined);
    setIsOpening(true);
    // Opened before the await, so the browser counts it as the click's.
    const tab = window.open('', '_blank');
    try {
      const { authorizationURL } = await client.connectProvider(provider.name);
      if (tab) {
        tab.opener = null;
        tab.location.href = authorizationURL;
      } else {
        window.open(authorizationURL, '_blank', 'noopener');
      }
      setIsWaiting(true);
    } catch (cause) {
      tab?.close();
      setError(classifyWorkspaceManagerError(cause).message);
    } finally {
      setIsOpening(false);
    }
  }, [client, provider.name]);

  return (
    <Flex direction="column" gap="2">
      {isWaiting && (
        <Text variant="body-small" color="secondary">
          Finish the sign-in in the new tab, then come back here.
        </Text>
      )}
      {error && (
        <Text variant="body-small" color="danger">
          Could not start the sign-in: {error}
        </Text>
      )}
      <div>
        <Button
          variant="secondary"
          size="small"
          isDisabled={isOpening}
          onPress={connect}
        >
          {isOpening ? 'Opening…' : `Connect ${label} ↗`}
        </Button>
      </div>
    </Flex>
  );
}

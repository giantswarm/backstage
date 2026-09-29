import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import {
  MusterServerNotConnectedError,
  platformCapabilitiesApiRef,
} from '../apis';
import { bounceAllowed, bounceToConnect } from './connectBounce';

export function isNotConnected(
  error: Error,
): error is MusterServerNotConnectedError {
  return (
    error instanceof MusterServerNotConnectedError ||
    error.name === 'MusterServerNotConnectedError'
  );
}

/**
 * Shows a failed request. A missing grant is not an error to read but a step
 * the page takes on its own: the browser is sent through muster's connect
 * once and comes back with the grant in place -- no dialog, no popup, no
 * click. Only when that bounce did not produce a grant does the alert stay
 * and offer the connect as a button.
 */
export function ErrorAlert(props: { title: string; error: Error }) {
  const { title, error } = props;
  if (isNotConnected(error)) {
    return <ConnectAlert error={error} />;
  }
  return <Alert status="danger" title={title} description={error.message} />;
}

function ConnectAlert({ error }: { error: MusterServerNotConnectedError }) {
  const api = useApi(platformCapabilitiesApiRef);
  const queryClient = useQueryClient();
  const [state, setState] = useState<
    'idle' | 'bouncing' | 'returned' | 'failed'
  >(() => (bounceAllowed() ? 'idle' : 'returned'));

  const connect = useCallback(async () => {
    let authUrl = error.authUrl;
    if (!authUrl) {
      const connection = await api.getConnection().catch(() => undefined);
      if (connection?.connected) {
        await queryClient.invalidateQueries({
          queryKey: ['platform-capabilities'],
        });
        return;
      }
      authUrl = connection?.authUrl;
    }
    if (!authUrl) {
      setState('failed');
      return;
    }
    setState('bouncing');
    bounceToConnect(authUrl);
  }, [error.authUrl, api, queryClient]);

  // First sight of a missing grant: go straight through muster's connect.
  useEffect(() => {
    if (state === 'idle') {
      void connect();
    }
  }, [state, connect]);

  return (
    <Alert
      status="warning"
      title={
        state === 'returned'
          ? 'Connect to the platform manager'
          : 'Connecting to the platform manager…'
      }
      description={
        <Flex direction="column" gap="2">
          <Text>
            Platform capabilities are read and changed as you: muster forwards
            your sign-in to giantswarm-platform-manager, which reads the
            installations&apos; repositories with your grant.
          </Text>
          {state === 'returned' && (
            <Text color="secondary">
              The connect did not complete. Try again; if Dex asks for consent,
              grant it.
            </Text>
          )}
          {state === 'failed' && (
            <Text color="secondary">
              muster offered no sign-in link: {error.message}
            </Text>
          )}
          {state === 'returned' && (
            <div>
              <Button variant="primary" size="small" onPress={connect}>
                Connect
              </Button>
            </div>
          )}
        </Flex>
      }
    />
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { MusterServerNotConnectedError, repositoriesApiRef } from '../apis';
import { bounceAllowed, bounceToConnect } from './connectBounce';

/**
 * Shows a failed request. A missing grant is not an error to read but a step
 * the page takes on its own: the browser is sent through muster's connect
 * once and comes back to this page with the grant in place -- no dialog, no
 * popup, no click. Only when that bounce did not produce a grant does the
 * alert stay and offer the connect as a button.
 */
export function RepositoriesErrorAlert(props: { title: string; error: Error }) {
  const { title, error } = props;
  if (
    error instanceof MusterServerNotConnectedError ||
    error.name === 'MusterServerNotConnectedError'
  ) {
    return <ConnectAlert error={error as MusterServerNotConnectedError} />;
  }
  return <Alert status="danger" title={title} description={error.message} />;
}

function ConnectAlert({ error }: { error: MusterServerNotConnectedError }) {
  const api = useApi(repositoriesApiRef);
  const queryClient = useQueryClient();
  const [state, setState] = useState<
    'idle' | 'bouncing' | 'returned' | 'failed'
  >(() => (bounceAllowed() ? 'idle' : 'returned'));

  const connect = useCallback(async () => {
    let authUrl = error.authUrl;
    if (!authUrl) {
      const connection = await api.getConnection().catch(() => undefined);
      if (connection?.connected) {
        await queryClient.invalidateQueries({ queryKey: ['repositories'] });
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
          ? 'Connect to the repository manager'
          : 'Connecting to the repository manager…'
      }
      description={
        <Flex direction="column" gap="2">
          <Text>
            The Repositories page reads the inventory as you: muster forwards
            your sign-in to giantswarm-repo-manager, which reads GitHub with
            your grant.
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

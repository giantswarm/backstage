import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { MusterServerNotConnectedError, plansApiRef } from '../apis';
import { bounceAllowed, bounceToConnect } from './connectBounce';

/**
 * Shows a failed plans request. A missing GitHub grant is not an error to
 * read but a step the page takes on its own: the browser is sent through
 * muster's GitHub connect once and comes back to this page with the grant
 * in place (GitHub redirects straight back when the App is already
 * authorized, i.e. after the Dex GitHub login) -- no dialog, no popup, no
 * click. Only when that bounce did not produce a grant does the alert stay
 * and offer the connect as a button.
 */
export function PlansErrorAlert(props: { title: string; error: Error }) {
  const { title, error } = props;
  if (
    error instanceof MusterServerNotConnectedError ||
    error.name === 'MusterServerNotConnectedError'
  ) {
    return (
      <ConnectGithubAlert error={error as MusterServerNotConnectedError} />
    );
  }
  return <Alert status="danger" title={title} description={error.message} />;
}

function ConnectGithubAlert({
  error,
}: {
  error: MusterServerNotConnectedError;
}) {
  const plansApi = useApi(plansApiRef);
  const queryClient = useQueryClient();
  const [state, setState] = useState<
    'idle' | 'bouncing' | 'returned' | 'failed'
  >(() => (bounceAllowed() ? 'idle' : 'returned'));

  const connect = useCallback(async () => {
    let authUrl = error.authUrl;
    if (!authUrl) {
      // The error carried no URL (e.g. the query was retried); ask again.
      const connection = await plansApi.getConnection().catch(() => undefined);
      if (connection?.connected) {
        await queryClient.invalidateQueries({ queryKey: ['plans'] });
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
  }, [error.authUrl, plansApi, queryClient]);

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
          ? 'Connect your GitHub account'
          : 'Connecting your GitHub account…'
      }
      description={
        <Flex direction="column" gap="2">
          <Text>
            The plans page reads and comments on GitHub as you. muster keeps the
            connection for all your sessions once GitHub redirects back.
          </Text>
          {state === 'returned' && (
            <Text color="secondary">
              The connect did not complete. Try again; if GitHub asks for
              consent, grant it.
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
                Connect GitHub
              </Button>
            </div>
          )}
        </Flex>
      }
    />
  );
}

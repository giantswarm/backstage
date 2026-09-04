import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { GithubNotConnectedError, plansApiRef } from '../apis';

/** How long the connect popup is watched before giving up (2s steps). */
const CONNECT_POLL_INTERVAL_MS = 2_000;
const CONNECT_POLL_MAX_ATTEMPTS = 60;

/**
 * Shows a failed plans request. A missing GitHub grant is not an error to
 * read but a step to take: the person connects their GitHub account to muster
 * once (GitHub redirects straight back when the App is already authorized,
 * i.e. after the Dex GitHub login), and every plans query reloads.
 */
export function PlansErrorAlert(props: { title: string; error: Error }) {
  const { title, error } = props;
  if (
    error instanceof GithubNotConnectedError ||
    error.name === 'GithubNotConnectedError'
  ) {
    return <ConnectGithubAlert error={error as GithubNotConnectedError} />;
  }
  return <Alert status="danger" title={title} description={error.message} />;
}

function ConnectGithubAlert({ error }: { error: GithubNotConnectedError }) {
  const plansApi = useApi(plansApiRef);
  const queryClient = useQueryClient();
  const [state, setState] = useState<'idle' | 'waiting' | 'timeout' | 'failed'>(
    'idle',
  );
  const popupRef = useRef<Window | null>(null);
  const cancelledRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

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
    popupRef.current = window.open(
      authUrl,
      'muster-github-connect',
      'width=600,height=720,noopener=no',
    );
    setState('waiting');
    for (let attempt = 0; attempt < CONNECT_POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise(resolve =>
        setTimeout(resolve, CONNECT_POLL_INTERVAL_MS),
      );
      if (cancelledRef.current) {
        return;
      }
      const connection = await plansApi.getConnection().catch(() => undefined);
      if (connection?.connected) {
        popupRef.current?.close();
        await queryClient.invalidateQueries({ queryKey: ['plans'] });
        return;
      }
    }
    setState('timeout');
  }, [error.authUrl, plansApi, queryClient]);

  return (
    <Alert
      status="warning"
      title="Connect your GitHub account"
      description={
        <Flex direction="column" gap="2">
          <Text>
            The plans page reads and comments on GitHub as you. Connect your
            GitHub account once; muster keeps the connection for all your
            sessions.
          </Text>
          {state === 'timeout' && (
            <Text color="secondary">
              The connection was not completed. Finish the sign-in in the popup
              and try again.
            </Text>
          )}
          {state === 'failed' && (
            <Text color="secondary">
              muster offered no sign-in link: {error.message}
            </Text>
          )}
          <div>
            <Button
              variant="primary"
              size="small"
              onPress={connect}
              isDisabled={state === 'waiting'}
            >
              {state === 'waiting' ? 'Waiting for GitHub…' : 'Connect GitHub'}
            </Button>
          </div>
        </Flex>
      }
    />
  );
}

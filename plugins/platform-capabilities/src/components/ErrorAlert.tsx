import { useCallback, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
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
 * Shows a failed request. A missing grant is a step, not an error: the alert
 * offers muster's connect, which opens after the person agrees in the
 * external URL consent dialog and comes back to this page with the grant in
 * place. A connect that came back without a grant says so.
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
  const consentApi = useApi(externalUrlConsentApiRef);
  const queryClient = useQueryClient();
  const [returned] = useState(() => !bounceAllowed());
  const [state, setState] = useState<'idle' | 'asking' | 'leaving' | 'failed'>(
    'idle',
  );

  const connect = useCallback(async () => {
    setState('asking');
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
    const answer = await bounceToConnect(consentApi, authUrl);
    setState(answer === 'accept' ? 'leaving' : 'idle');
  }, [error.authUrl, api, queryClient, consentApi]);

  return (
    <Alert
      status="warning"
      title={
        state === 'leaving'
          ? 'Connecting to the platform manager…'
          : 'Connect to the platform manager'
      }
      description={
        <Flex direction="column" gap="2">
          <Text>
            Platform capabilities are read and changed as you: muster forwards
            your sign-in to giantswarm-platform-manager, which reads the
            installations&apos; repositories with your grant.
          </Text>
          {returned && state !== 'leaving' && (
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
          {(state === 'idle' || state === 'asking') && (
            <div>
              <Button
                variant="primary"
                size="small"
                isPending={state === 'asking'}
                onPress={connect}
              >
                Connect
              </Button>
            </div>
          )}
        </Flex>
      }
    />
  );
}

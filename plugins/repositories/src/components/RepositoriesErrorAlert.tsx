import { useCallback, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { MusterServerNotConnectedError, repositoriesApiRef } from '../apis';
import { bounceAllowed, bounceToConnect } from './connectBounce';

/**
 * Shows a failed request. A missing grant is a step, not an error: the alert
 * offers muster's connect, which opens after the person agrees in the
 * external URL consent dialog and comes back to this page with the grant in
 * place. A connect that came back without a grant says so.
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
        await queryClient.invalidateQueries({ queryKey: ['repositories'] });
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
          ? 'Connecting to the repository manager…'
          : 'Connect to the repository manager'
      }
      description={
        <Flex direction="column" gap="2">
          <Text>
            The Repositories page reads the inventory as you: muster forwards
            your sign-in to giantswarm-repo-manager, which reads GitHub with
            your grant.
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

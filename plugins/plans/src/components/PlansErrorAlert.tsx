import { useCallback, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { MusterServerNotConnectedError, plansApiRef } from '../apis';
import { bounceAllowed, bounceToConnect } from './connectBounce';

/**
 * Shows a failed plans request. A missing GitHub grant is a step, not an
 * error: the alert offers muster's GitHub connect, which opens after the
 * person agrees in the external URL consent dialog and comes back to this
 * page with the grant in place. A connect that came back without a grant
 * says so.
 */
export function PlansErrorAlert(props: {
  title: string;
  error: Error;
  /** Offers "Try again" when given; `retrying` while the retry runs. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { title, error, onRetry, retrying } = props;
  if (
    error instanceof MusterServerNotConnectedError ||
    error.name === 'MusterServerNotConnectedError'
  ) {
    return (
      <ConnectGithubAlert error={error as MusterServerNotConnectedError} />
    );
  }
  return (
    <Alert
      status="danger"
      title={title}
      description={
        onRetry ? (
          <Flex direction="column" gap="2">
            <Text>{error.message}</Text>
            <div>
              <Button
                variant="secondary"
                size="small"
                onPress={onRetry}
                isDisabled={retrying}
              >
                {retrying ? 'Trying again…' : 'Try again'}
              </Button>
            </div>
          </Flex>
        ) : (
          error.message
        )
      }
    />
  );
}

function ConnectGithubAlert({
  error,
}: {
  error: MusterServerNotConnectedError;
}) {
  const plansApi = useApi(plansApiRef);
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
    const answer = await bounceToConnect(consentApi, authUrl);
    setState(answer === 'accept' ? 'leaving' : 'idle');
  }, [error.authUrl, plansApi, queryClient, consentApi]);

  return (
    <Alert
      status="warning"
      title={
        state === 'leaving'
          ? 'Connecting your GitHub account…'
          : 'Connect your GitHub account'
      }
      description={
        <Flex direction="column" gap="2">
          <Text>
            The plans page reads and comments on GitHub as you. muster keeps the
            connection for all your sessions once GitHub redirects back.
          </Text>
          {returned && state !== 'leaving' && (
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
          {(state === 'idle' || state === 'asking') && (
            <div>
              <Button
                variant="primary"
                size="small"
                isPending={state === 'asking'}
                onPress={connect}
              >
                Connect GitHub
              </Button>
            </div>
          )}
        </Flex>
      }
    />
  );
}

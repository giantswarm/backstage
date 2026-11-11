import { useCallback, useState } from 'react';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import { Alert, AlertTitle } from '@material-ui/lab';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { MusterServerNotConnectedError, roadmapApiRef } from '../apis';
import { bounceAllowed, bounceToConnect } from './connectBounce';

/**
 * Shows a failed roadmap request. A missing GitHub grant is a step, not an
 * error: the alert offers muster's GitHub connect, which opens after the
 * person agrees in the external URL consent dialog and comes back to this
 * page with the grant in place. A connect that came back without a grant
 * says so.
 */
export function RoadmapErrorAlert({ error }: { error: Error }) {
  if (
    error instanceof MusterServerNotConnectedError ||
    error.name === 'MusterServerNotConnectedError'
  ) {
    return (
      <ConnectGithubAlert error={error as MusterServerNotConnectedError} />
    );
  }
  return <Alert severity="error">{error.message}</Alert>;
}

function ConnectGithubAlert({
  error,
}: {
  error: MusterServerNotConnectedError;
}) {
  const roadmapApi = useApi(roadmapApiRef);
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
      const connection = await roadmapApi
        .getConnection()
        .catch(() => undefined);
      if (connection?.connected) {
        await queryClient.invalidateQueries({ queryKey: ['roadmap'] });
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
  }, [error.authUrl, roadmapApi, queryClient, consentApi]);

  return (
    <Alert
      severity="warning"
      action={
        state === 'idle' || state === 'asking' ? (
          <Button
            color="inherit"
            size="small"
            disabled={state === 'asking'}
            onClick={connect}
          >
            Connect GitHub
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>
        {state === 'leaving'
          ? 'Connecting your GitHub account…'
          : 'Connect your GitHub account'}
      </AlertTitle>
      The roadmap board is read and changed as you. muster keeps the connection
      for all your sessions once GitHub redirects back.
      {returned && state !== 'leaving' && (
        <Typography variant="body2" color="textSecondary">
          The connect did not complete. Try again; if GitHub asks for consent,
          grant it.
        </Typography>
      )}
      {state === 'failed' && (
        <Typography variant="body2" color="textSecondary">
          muster offered no sign-in link: {error.message}
        </Typography>
      )}
    </Alert>
  );
}

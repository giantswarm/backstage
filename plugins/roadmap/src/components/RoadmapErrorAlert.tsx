import { useCallback, useEffect, useState } from 'react';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import { Alert, AlertTitle } from '@material-ui/lab';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { MusterServerNotConnectedError, roadmapApiRef } from '../apis';
import { bounceAllowed, bounceToConnect } from './connectBounce';

/**
 * Shows a failed roadmap request. A missing GitHub grant is not an error to
 * read but a step the page takes on its own: the browser is sent through
 * muster's GitHub connect once and comes back to this page with the grant
 * in place (GitHub redirects straight back when the App is already
 * authorized, i.e. after the Dex GitHub login) -- no dialog, no popup, no
 * click. Only when that bounce did not produce a grant does the alert stay
 * and offer the connect as a button.
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
  const queryClient = useQueryClient();
  const [state, setState] = useState<
    'idle' | 'bouncing' | 'returned' | 'failed'
  >(() => (bounceAllowed() ? 'idle' : 'returned'));

  const connect = useCallback(async () => {
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
    setState('bouncing');
    bounceToConnect(authUrl);
  }, [error.authUrl, roadmapApi, queryClient]);

  // First sight of a missing grant: go straight through muster's connect.
  useEffect(() => {
    if (state === 'idle') {
      void connect();
    }
  }, [state, connect]);

  return (
    <Alert
      severity="warning"
      action={
        state === 'returned' ? (
          <Button color="inherit" size="small" onClick={connect}>
            Connect GitHub
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>
        {state === 'returned'
          ? 'Connect your GitHub account'
          : 'Connecting your GitHub account…'}
      </AlertTitle>
      The roadmap board is read and changed as you. muster keeps the connection
      for all your sessions once GitHub redirects back.
      {state === 'returned' && (
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

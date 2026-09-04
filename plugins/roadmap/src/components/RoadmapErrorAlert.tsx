import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import { Alert, AlertTitle } from '@material-ui/lab';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { MusterServerNotConnectedError, roadmapApiRef } from '../apis';

/** How long the connect popup is watched before giving up (2s steps). */
const CONNECT_POLL_INTERVAL_MS = 2_000;
const CONNECT_POLL_MAX_ATTEMPTS = 60;

/**
 * Shows a failed roadmap request. A missing GitHub grant is not an error to
 * read but a step to take: the person connects their GitHub account to muster
 * once (GitHub redirects straight back when the App is already authorized,
 * i.e. after the Dex GitHub login), and every roadmap query reloads.
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
    popupRef.current = window.open(
      authUrl,
      'muster-github-connect',
      'width=600,height=720',
    );
    setState('waiting');
    for (let attempt = 0; attempt < CONNECT_POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise(resolve =>
        setTimeout(resolve, CONNECT_POLL_INTERVAL_MS),
      );
      if (cancelledRef.current) {
        return;
      }
      const connection = await roadmapApi
        .getConnection()
        .catch(() => undefined);
      if (connection?.connected) {
        popupRef.current?.close();
        await queryClient.invalidateQueries({ queryKey: ['roadmap'] });
        return;
      }
    }
    setState('timeout');
  }, [error.authUrl, roadmapApi, queryClient]);

  return (
    <Alert
      severity="warning"
      action={
        <Button
          color="inherit"
          size="small"
          onClick={connect}
          disabled={state === 'waiting'}
        >
          {state === 'waiting' ? 'Waiting for GitHub…' : 'Connect GitHub'}
        </Button>
      }
    >
      <AlertTitle>Connect your GitHub account</AlertTitle>
      The roadmap board is read and changed as you. Connect your GitHub account
      once; muster keeps the connection for all your sessions.
      {state === 'timeout' && (
        <Typography variant="body2" color="textSecondary">
          The connection was not completed. Finish the sign-in in the popup and
          try again.
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

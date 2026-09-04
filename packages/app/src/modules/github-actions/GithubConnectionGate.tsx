import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import { Alert, AlertTitle } from '@material-ui/lab';
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { githubActionsConnectionApiRef } from './apis';
import { GithubActionsConnection } from './GithubActionsApiClient';

/** How long the connect popup is watched before giving up (2s steps). */
const CONNECT_POLL_INTERVAL_MS = 2_000;
const CONNECT_POLL_MAX_ATTEMPTS = 60;

type GateState =
  | { status: 'checking' }
  | { status: 'connected' }
  | { status: 'disconnected'; connection: GithubActionsConnection }
  | { status: 'error'; error: Error };

/**
 * Renders the GitHub Actions tab only once the person's GitHub is connected
 * in muster. A missing grant is not an error to read but a step to take: the
 * person connects their GitHub account to muster once (GitHub redirects
 * straight back when the App is already authorized, i.e. after the Dex GitHub
 * login), and the tab loads. Portals that do not run the tab through muster
 * pass straight through.
 */
export function GithubConnectionGate({ children }: PropsWithChildren<{}>) {
  const connectionApi = useApi(githubActionsConnectionApiRef);
  const [state, setState] = useState<GateState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    connectionApi
      .getConnection()
      .then(connection => {
        if (cancelled) return;
        setState(
          connection.connected
            ? { status: 'connected' }
            : { status: 'disconnected', connection },
        );
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', error });
      });
    return () => {
      cancelled = true;
    };
  }, [connectionApi]);

  if (state.status === 'checking') {
    return <Progress />;
  }
  if (state.status === 'connected') {
    return <>{children}</>;
  }
  if (state.status === 'error') {
    return (
      <Alert severity="error">
        <AlertTitle>GitHub Actions unavailable</AlertTitle>
        {state.error.message}
      </Alert>
    );
  }
  return (
    <ConnectGithubAlert
      connection={state.connection}
      onConnected={() => setState({ status: 'connected' })}
    />
  );
}

function ConnectGithubAlert({
  connection,
  onConnected,
}: {
  connection: GithubActionsConnection;
  onConnected: () => void;
}) {
  const connectionApi = useApi(githubActionsConnectionApiRef);
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
    let authUrl = connection.authUrl;
    if (!authUrl) {
      const current = await connectionApi
        .getConnection()
        .catch(() => undefined);
      if (current?.connected) {
        onConnected();
        return;
      }
      authUrl = current?.authUrl;
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
      const current = await connectionApi
        .getConnection()
        .catch(() => undefined);
      if (current?.connected) {
        popupRef.current?.close();
        onConnected();
        return;
      }
    }
    setState('timeout');
  }, [connection.authUrl, connectionApi, onConnected]);

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
      Workflow runs are read and re-run as you. Connect your GitHub account
      once; muster keeps the connection for all your sessions.
      {state === 'timeout' && (
        <Typography variant="body2" color="textSecondary">
          The connection was not completed. Finish the sign-in in the popup and
          try again.
        </Typography>
      )}
      {state === 'failed' && (
        <Typography variant="body2" color="textSecondary">
          muster offered no sign-in link
          {connection.message ? `: ${connection.message}` : '.'}
        </Typography>
      )}
    </Alert>
  );
}

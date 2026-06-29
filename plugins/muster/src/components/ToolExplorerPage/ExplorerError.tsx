import { Button } from '@material-ui/core';
import { Alert, AlertTitle } from '@material-ui/lab';
import { ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';

/**
 * True when an error reflects a missing/expired muster auth token rather than a
 * genuine failure. The backend raises AuthenticationError (401) when the target
 * installation requires a user token that wasn't forwarded.
 */
export function isAuthError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const err = error as { name?: string; message?: string };
  return (
    err.name === 'UnauthorizedError' ||
    /requires a user token|authentication|unauthorized|sign in/i.test(
      err.message ?? '',
    )
  );
}

export interface ExplorerErrorProps {
  error: unknown;
  installation?: string;
}

/**
 * Renders a query error: an actionable inline "Sign in" affordance when the
 * error is an auth failure, otherwise the standard error panel. Keeps the
 * Auth-Required path friendly instead of dumping a raw 401.
 */
export function ExplorerError({ error, installation }: ExplorerErrorProps) {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();

  const signIn = useMutation({
    mutationFn: () => musterApi.signIn(installation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muster'] });
    },
  });

  if (!isAuthError(error)) {
    return <ResponseErrorPanel error={error as Error} />;
  }

  return (
    <Alert
      severity="info"
      action={
        <Button
          color="inherit"
          size="small"
          disabled={signIn.isPending}
          onClick={() => signIn.mutate()}
        >
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      }
    >
      <AlertTitle>Authentication required</AlertTitle>
      Sign in to muster
      {installation ? ` (${installation})` : ''} to browse and run its tools.
      {signIn.isError && ' Sign-in failed — check the muster auth provider.'}
    </Alert>
  );
}

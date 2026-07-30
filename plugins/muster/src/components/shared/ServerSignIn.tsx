import { makeStyles, Theme } from '@material-ui/core';
import { Button, ButtonLink, Text } from '@backstage/ui';
import { useServerSignIn } from './useServerSignIn';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  name: {
    fontFamily: theme.typography.fontFamily,
    fontSize: '0.8125rem',
  },
}));

export interface ServerSignInProps {
  /** The muster server name, as reported by `list_tools` / `auth://status`. */
  serverName: string;
  installation?: string;
  /** Show the server name next to the action (the tool explorer's list). */
  showName?: boolean;
  /**
   * Render nothing unless `auth://status` reports this server as needing a user
   * sign-in. Used where the affordance sits next to always-visible content (the
   * MCP servers page); the tool explorer omits it because muster already told it
   * these servers are auth-gated.
   */
  onlyWhenRequired?: boolean;
}

/**
 * The actionable "Sign in" affordance for one OAuth-protected aggregated MCP
 * server. Clicking it asks muster for a sign-in URL (`core_auth_login`) and
 * offers it as a link; completing the flow in the other tab connects the server
 * for this muster session and the surrounding content unblocks on its own --
 * see {@link useServerSignIn}.
 *
 * SSO-managed servers (token forwarding/exchange) get an explanation instead of
 * a button: their connection comes from muster's own session, so there is
 * nothing for the user to sign in to.
 */
export function ServerSignIn({
  serverName,
  installation,
  showName,
  onlyWhenRequired,
}: ServerSignInProps) {
  const classes = useStyles();
  const {
    status,
    isPending,
    authUrl,
    hasTimedOut,
    error,
    isSsoManaged,
    needsLogin,
    signIn,
  } = useServerSignIn(serverName, installation);

  const idle = !authUrl && !error;
  if (onlyWhenRequired && !needsLogin && idle) {
    return null;
  }

  if (isSsoManaged) {
    if (!needsLogin) {
      return null;
    }
    return (
      <Text as="p" variant="body-small" color="secondary">
        {serverName} authenticates through SSO from muster's own session, so
        there is nothing to sign in to here.
        {status?.sso_attempt_failed
          ? " muster tried and failed to establish it for your session — check the server's trusted audiences with an administrator."
          : ''}
      </Text>
    );
  }

  return (
    <div className={classes.root}>
      {showName ? <code className={classes.name}>{serverName}</code> : null}
      {authUrl ? (
        <>
          <ButtonLink
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="small"
          >
            Open sign-in page ↗
          </ButtonLink>
          <Text variant="body-small" color="secondary">
            {hasTimedOut
              ? 'Still not connected — open the link, then reload this page.'
              : 'Waiting for you to finish signing in…'}
          </Text>
        </>
      ) : (
        <Button
          variant="secondary"
          size="small"
          isPending={isPending}
          onClick={signIn}
        >
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      )}
      {error ? (
        <Text variant="body-small" color="danger">
          {error}
        </Text>
      ) : null}
    </div>
  );
}

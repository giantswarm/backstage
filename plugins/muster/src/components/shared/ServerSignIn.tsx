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
   * sign-in (or a sign-in from this session has something to say about it). Used
   * where the affordance sits next to always-visible content (the MCP servers
   * page); the tool explorer omits it because muster already told it these
   * servers are auth-gated.
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
    clientIdMethod,
    error,
    note,
    isSsoManaged,
    needsLogin,
    signIn,
  } = useServerSignIn(serverName, installation);

  const messages =
    error || note ? (
      <>
        {note ? (
          <Text variant="body-small" color="secondary">
            {note}
          </Text>
        ) : null}
        {error ? (
          <Text variant="body-small" color="danger">
            {error}
          </Text>
        ) : null}
      </>
    ) : null;

  // `idle` deliberately ignores `error`/`note`: they are the answer to a click,
  // which by definition happened on a row that was already visible, so letting
  // them defeat the gate would pin an unrelated row open (they also do not
  // survive a remount, unlike the pending entry).
  //
  // `sso_attempt_failed` is let through because it names a concrete
  // misconfiguration, and the MCP servers page -- where this gate applies -- is
  // where an operator would look for it.
  const ssoDiagnosis = isSsoManaged && Boolean(status?.sso_attempt_failed);
  if (onlyWhenRequired && !needsLogin && !ssoDiagnosis && !authUrl) {
    return null;
  }

  // Reaching here means we know the server is SSO-managed, so the explanation is
  // always more useful than nothing. It deliberately does NOT re-gate on
  // `needsLogin`: the tool explorer renders this without `onlyWhenRequired`
  // precisely because muster already said the server is auth-gated, and a
  // status like `failed`/`sso_pending` would otherwise leave the alert claiming
  // a server needs authentication with no name, action, or reason shown.
  if (isSsoManaged) {
    return (
      <div className={classes.root}>
        <Text as="p" variant="body-small" color="secondary">
          {serverName} authenticates through SSO from muster's own session, so
          there is nothing to sign in to here.
          {status?.sso_attempt_failed
            ? " muster tried and failed to establish it for your session — check the server's trusted audiences with an administrator."
            : ''}
        </Text>
        {/* Rendered under the paragraph, not instead of it: a specific refusal
            (rate limit, issuer discovery) must not be swapped for the generic
            SSO explanation. */}
        {messages}
      </div>
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
            Waiting for you to finish signing in…
          </Text>
          {/* muster#1083: the challenge says how muster identifies itself to
              the authorization server. Only the fallbacks deserve a warning —
              they are the cases where the AS may reject the sign-in as an
              unregistered client. DCR gets a quiet note because the consent
              screen will show an auto-registered client rather than a
              pre-provisioned one, which can otherwise look suspicious. */}
          {clientIdMethod === 'cimd-fallback' ? (
            <Text variant="body-small" color="warning">
              This server's authorization server advertises neither support for
              muster's client identity (CIMD) nor automatic client registration
              — the sign-in may be rejected as an unregistered client.
            </Text>
          ) : null}
          {/* muster#1086: distinct from cimd-fallback — the AS does offer
              client registration but rejected muster's request (its actual
              rejection is in muster's challenge message and logs). */}
          {clientIdMethod === 'dcr-failed' ? (
            <Text variant="body-small" color="warning">
              This server's authorization server rejected muster's automatic
              client registration — the sign-in may be rejected as an
              unregistered client.
            </Text>
          ) : null}
          {clientIdMethod === 'dcr' ? (
            <Text variant="body-small" color="secondary">
              muster registered itself with this server's authorization server
              automatically (Dynamic Client Registration).
            </Text>
          ) : null}
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
      {messages}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Button, Flex, Link, Text } from '@backstage/ui';
import { useServerSignIn } from '../shared';

/**
 * What a provider App is called and what connecting it is for, where its name
 * does not say. Apps not listed here are shown by their name.
 */
const PROVIDER_APPS: Record<string, { label: string; hint?: string }> = {
  chatgpt: {
    label: 'ChatGPT',
    hint: 'Your codex agents run on your own ChatGPT subscription.',
  },
};

/** The name a provider App is shown by. */
export function providerAppLabel(name: string): string {
  return PROVIDER_APPS[name]?.label ?? name;
}

/** What connecting the provider App is for, when the portal knows. */
export function providerAppHint(name: string): string | undefined {
  return PROVIDER_APPS[name]?.hint;
}

/** The state a provider App row shows. */
export type ProviderAppRowState =
  'not_connected' | 'waiting' | 'connected' | 'failed';

export type ProviderAppSignInProps = {
  /** The provider App, as muster lists it in `auth://status`. */
  app: string;
  /** The muster installation that keeps the person's grant. */
  installation?: string;
  /** How often `auth://status` is re-read while waiting; tests shorten it. */
  pollIntervalMs?: number;
};

/** Minutes left until `expiresAt`, re-read every 15 seconds. */
function useMinutesLeft(expiresAt: number | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === undefined) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt === undefined
    ? undefined
    : Math.max(0, Math.ceil((expiresAt - now) / 60_000));
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="small"
      aria-label={`Copy the code ${code}`}
      onPress={() => {
        navigator.clipboard
          ?.writeText(code)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/**
 * The person's connection to one provider App muster keeps (the ChatGPT
 * subscription their codex agents run on, a Git provider's App): its state
 * and the action that changes it.
 *
 * *Connect* is muster's `core_auth_login app=<name>`. An App with a
 * device-code sign-in answers with a code: the provider's page opens in a new
 * tab, the code is shown here to enter there, and muster files the grant once
 * it is entered; `auth://status` is polled until the App reads connected or
 * the code is given up. *Disconnect* is `core_auth_logout app=<name>`, which
 * also ends an outstanding code. No token passes through the portal.
 */
export function ProviderAppSignIn({
  app,
  installation,
  pollIntervalMs,
}: ProviderAppSignInProps) {
  const signIn = useServerSignIn(app, installation, {
    noun: 'connector',
    app: true,
    pollIntervalMs,
  });
  const label = providerAppLabel(app);
  const minutesLeft = useMinutesLeft(signIn.deviceCode?.expiresAt);

  const lastFailure = signIn.providerApp?.last_failure;
  let state: ProviderAppRowState = 'not_connected';
  if (signIn.isConnected) {
    state = 'connected';
  } else if (signIn.deviceCode || signIn.isWaiting) {
    state = 'waiting';
  } else if (lastFailure) {
    state = 'failed';
  }

  if (state === 'connected') {
    return (
      <Flex direction="column" gap="1" data-state={state}>
        <Flex gap="2" align="center">
          <Text variant="body-small" color="success">
            ✓ Connected
          </Text>
          <Button
            variant="secondary"
            size="small"
            isDisabled={signIn.isSigningOut}
            onPress={signIn.signOut}
          >
            {signIn.isSigningOut ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </Flex>
        {signIn.error && (
          <Text variant="body-small" color="danger">
            {signIn.error}
          </Text>
        )}
      </Flex>
    );
  }

  if (state === 'waiting') {
    const code = signIn.deviceCode;
    return (
      <Flex direction="column" gap="2" data-state={state}>
        <Text variant="body-small" weight="bold" role="status">
          {code ? 'Waiting for your code' : `Waiting for ${label}…`}
        </Text>
        {code ? (
          <ol style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
            <li>
              <Text variant="body-small">
                Open{' '}
                <Link
                  href={code.verificationUrl}
                  target="_blank"
                  rel="noopener"
                >
                  {code.verificationUrl}
                </Link>{' '}
                and sign in.
              </Text>
            </li>
            <li>
              <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
                <Text variant="body-small">Enter</Text>
                <Text
                  variant="body-medium"
                  weight="bold"
                  data-testid="provider-app-user-code"
                  style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
                >
                  {code.userCode}
                </Text>
                <CopyCode code={code.userCode} />
                {minutesLeft !== undefined && (
                  <Text variant="body-small" color="secondary">
                    {minutesLeft <= 1
                      ? '(expires within a minute)'
                      : `(${minutesLeft} min)`}
                  </Text>
                )}
              </Flex>
            </li>
          </ol>
        ) : (
          <Text variant="body-small" color="secondary">
            Finish in the other tab; this row updates on its own.
          </Text>
        )}
        {code && (
          <Text variant="body-small" color="secondary">
            Device-code sign-in may need to be enabled in {label}'s security
            settings. Enter the code only because you started this connection
            yourself.
          </Text>
        )}
        <Flex gap="2">
          <Button
            variant="secondary"
            size="small"
            isDisabled={signIn.isSigningOut}
            onPress={signIn.signOut}
          >
            Cancel
          </Button>
        </Flex>
        {signIn.error && (
          <Text variant="body-small" color="danger">
            {signIn.error}
          </Text>
        )}
      </Flex>
    );
  }

  let connectLabel = state === 'failed' ? 'Try again' : 'Connect';
  if (signIn.isPending) {
    connectLabel = 'Connecting…';
  }
  return (
    <Flex direction="column" gap="1" data-state={state}>
      <Flex gap="2" align="center">
        <Text
          variant="body-small"
          color={state === 'failed' ? 'danger' : 'secondary'}
        >
          {state === 'failed' ? 'Not connected: failed' : 'Not connected'}
        </Text>
        <Button
          variant="primary"
          size="small"
          isDisabled={signIn.isPending}
          onPress={signIn.signIn}
        >
          {connectLabel}
        </Button>
      </Flex>
      {state === 'failed' && (
        <Text variant="body-small" color="danger">
          {lastFailure}
        </Text>
      )}
      {signIn.error && (
        <Text variant="body-small" color="danger">
          {signIn.error}
        </Text>
      )}
    </Flex>
  );
}

import { useEffect, useRef } from 'react';
import { Alert, Button, Flex, Link, Text } from '@backstage/ui';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';

import {
  providerDisplayName,
  providerKindName,
  providerSignInServer,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';

export type ProviderConnectPromptProps = {
  /** The installation whose muster holds the person's grant. */
  installation: string;
  /** A provider instance the person has not granted, from `list_providers`. */
  provider: WorkspaceProvider;
  /**
   * Reads `list_providers` again; called once muster reports the grant, so
   * the host sees the new state and carries on with its draft.
   */
  onRecheck: () => void;
};

/**
 * What granting a provider's App means, in the provider's own terms: GitHub
 * only asks a person already signed in through the company login to approve;
 * any other provider has its own accounts and asks for a sign-in first.
 */
function signInCopy(provider: WorkspaceProvider) {
  const kind = providerKindName(provider.kind);
  const label = providerDisplayName(provider);
  if (provider.kind.toLowerCase() === 'github') {
    return {
      title: `Allow Agent Platform to use ${label} as you`,
      lead: `Workspaces read your repositories, and agents push to them, with your own ${kind} access. ${kind} only asks you to approve.`,
      steps: [
        `${kind} shows the Agent Platform's App and what it may do.`,
        'Approve. You come back here, signed in.',
      ],
      cta: `Continue with ${kind}`,
    };
  }
  return {
    title: `Sign in to ${label}`,
    lead: `Workspaces read your projects, and agents push to them, with your own ${kind} access. ${label} has its own accounts, so it asks you to sign in first.`,
    steps: [
      `Sign in on ${label} with your ${kind} account.`,
      "Approve the Agent Platform's access. You come back here, signed in.",
    ],
    cta: `Sign in to ${kind}`,
  };
}

/**
 * The inline sign-in for a provider instance the person has not granted:
 * what granting means, and {@link ProviderConnectAction}.
 */
export function ProviderConnectPrompt(props: ProviderConnectPromptProps) {
  const copy = signInCopy(props.provider);
  return (
    <Alert
      status="info"
      data-testid={`provider-connect-${props.provider.name}`}
      title={copy.title}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">{copy.lead}</Text>
          <ol style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
            {copy.steps.map(step => (
              <li key={step}>
                <Text variant="body-small">{step}</Text>
              </li>
            ))}
          </ol>
          <ProviderConnectAction {...props} />
        </Flex>
      }
    />
  );
}

/**
 * The grant itself, held by muster (workspace-manager reads the App token
 * muster attaches to each call): muster's sign-in for the server the
 * provider's `signIn` names, opened in a new tab. No token or code passes
 * through the portal. Where `signIn` names no server muster's portal sign-in
 * can start, its sentence is shown as the manager wrote it.
 */
export function ProviderConnectAction({
  installation,
  provider,
  onRecheck,
}: ProviderConnectPromptProps) {
  const server = providerSignInServer(provider.signIn);
  if (!server) {
    return (
      <Text variant="body-small" color="secondary">
        {provider.signIn ??
          `Ask your platform team to let the Agent Platform use ${providerDisplayName(
            provider,
          )}.`}
      </Text>
    );
  }
  return (
    <MusterGrant
      installation={installation}
      provider={provider}
      server={server}
      onRecheck={onRecheck}
    />
  );
}

function MusterGrant({
  installation,
  provider,
  server,
  onRecheck,
}: ProviderConnectPromptProps & { server: string }) {
  const signIn = useServerSignIn(server, installation, { noun: 'connector' });
  const kind = providerKindName(provider.kind);
  const copy = signInCopy(provider);

  // A sign-in this prompt started and muster now reports done: the provider
  // list is read again, once, and the prompt goes with the grant. A server
  // already connected says nothing about this provider, so it alone shows
  // the sign-in still.
  const started = useRef(false);
  if (signIn.isWaiting) {
    started.current = true;
  }
  const granted = started.current && signIn.isConnected;
  useEffect(() => {
    if (granted) {
      onRecheck();
    }
  }, [granted, onRecheck]);

  if (granted) {
    return (
      <Flex direction="column" gap="1">
        <Text variant="body-small" weight="bold">
          Signed in to {kind}
        </Text>
        <Text variant="body-small" color="secondary">
          You will not be asked again on this installation until you sign out in
          your profile.
        </Text>
      </Flex>
    );
  }

  if (signIn.isWaiting) {
    return (
      <Flex direction="column" gap="2">
        <Text variant="body-small" weight="bold">
          Waiting for {kind}…
        </Text>
        <Text variant="body-small" color="secondary">
          Finish in the other tab. The owners and repositories appear here as
          soon as you are back.
        </Text>
        {signIn.signInTabOpened || !signIn.authUrl ? (
          <div>
            <Button
              variant="secondary"
              size="small"
              isDisabled={signIn.isPending}
              onPress={signIn.signIn}
            >
              Open the tab again
            </Button>
          </div>
        ) : (
          <Link href={signIn.authUrl} target="_blank" rel="noopener">
            Open the {kind} sign-in
          </Link>
        )}
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="1">
      {signIn.error && (
        <Text variant="body-small" color="danger">
          Could not start the sign-in: {signIn.error}
        </Text>
      )}
      <div>
        <Button
          variant="primary"
          size="small"
          isDisabled={signIn.isPending}
          onPress={signIn.signIn}
        >
          {signIn.isPending ? 'Opening…' : `${copy.cta} ↗`}
        </Button>
      </div>
      <Text variant="body-small" color="secondary">
        Opens a new tab. This form keeps what you entered.
      </Text>
    </Flex>
  );
}

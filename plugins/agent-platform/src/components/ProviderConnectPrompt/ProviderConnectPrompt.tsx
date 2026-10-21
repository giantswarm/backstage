import { useEffect, useRef, type ReactNode } from 'react';
import { Alert, Button, Flex, Link, Text } from '@backstage/ui';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { useWorkspaceProviders } from '../../hooks/useWorkspaceEditor';
import { useWorkspaceManagerClient } from '../../hooks/useWorkspaceManager';
import {
  providerDisplayName,
  providerKindName,
  providerSignInTarget,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';

export type ProviderConnectActionProps = {
  /** The installation whose muster holds the person's grant. */
  installation: string;
  /** A provider instance the person has not granted, from `list_providers`. */
  provider: WorkspaceProvider;
  /**
   * The provider instance now reads connected in `list_providers`, re-read
   * when the person is back from the sign-in tab: the host carries on with
   * its draft or prompt. Called once.
   */
  onConnected?: () => void;
  /** What happens once the person is back, said while muster waits. */
  waitingNote?: string;
};

export type ProviderConnectPromptProps = ProviderConnectActionProps & {
  /** The host's own title; what granting means by default. */
  title?: string;
  /** The host's own explanation; what granting means by default. */
  lead?: string;
  /** The host's own actions beside the sign-in (start without, cancel). */
  actions?: ReactNode;
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
    lead: `Workspaces read your projects, and agents push to them, with your own ${kind || 'provider'} access. ${label} has its own accounts, so it asks you to sign in first.`,
    steps: [
      `Sign in on ${label} with your ${kind || 'provider'} account.`,
      "Approve the Agent Platform's access. You come back here, signed in.",
    ],
    cta: kind ? `Sign in to ${kind}` : `Sign in to ${label}`,
  };
}

/**
 * The inline sign-in for a provider instance the person has not granted,
 * wherever a person first meets it (the workspace editor, the composer's
 * workspace start): what granting means, and {@link ProviderConnectAction}.
 * Several prompts, one per provider instance, connect independently.
 */
export function ProviderConnectPrompt({
  title,
  lead,
  actions,
  ...props
}: ProviderConnectPromptProps) {
  const copy = signInCopy(props.provider);
  return (
    <Alert
      status="info"
      data-testid={`provider-connect-${props.provider.name}`}
      title={title ?? copy.title}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">{lead ?? copy.lead}</Text>
          {!lead && (
            <ol style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
              {copy.steps.map(step => (
                <li key={step}>
                  <Text variant="body-small">{step}</Text>
                </li>
              ))}
            </ol>
          )}
          <Flex gap="2" align="start" style={{ flexWrap: 'wrap' }}>
            <ProviderConnectAction {...props} />
            {actions}
          </Flex>
        </Flex>
      }
    />
  );
}

/**
 * The grant itself, held by muster (workspace-manager reads the App token
 * muster attaches to each call): muster's sign-in for the provider instance's
 * App, or for the server the manager is pinned to, opened in a new tab. No
 * token or code passes through the portal. Where `signIn` names no grant
 * muster's portal sign-in can start, its sentence is shown as the manager
 * wrote it.
 */
export function ProviderConnectAction(props: ProviderConnectActionProps) {
  const target = providerSignInTarget(props.provider.signIn);
  if (!target) {
    return (
      <Text variant="body-small" color="secondary">
        {props.provider.signIn ??
          `Ask your platform team to let the Agent Platform use ${providerDisplayName(
            props.provider,
          )}.`}
      </Text>
    );
  }
  return <MusterGrant {...props} target={target} />;
}

function MusterGrant({
  installation,
  provider,
  target,
  onConnected,
  waitingNote = 'Finish in the other tab. The owners and repositories appear here as soon as you are back.',
}: ProviderConnectActionProps & { target: { name: string; app: boolean } }) {
  const signIn = useServerSignIn(target.name, installation, {
    noun: 'connector',
    app: target.app,
  });
  const client = useWorkspaceManagerClient(installation);
  // Read again when the window regains focus (the person is back from the
  // sign-in tab), and once muster reports the grant below.
  const providers = useWorkspaceProviders(client);
  const kind = providerKindName(provider.kind) || providerDisplayName(provider);
  const copy = signInCopy(provider);

  // A sign-in this prompt started and muster now reports done: the provider
  // list is read again. A server already connected says nothing about this
  // provider, so it alone shows the sign-in still.
  const started = useRef(false);
  if (signIn.isWaiting) {
    started.current = true;
  }
  const granted = started.current && signIn.isConnected;
  const { refetch } = providers;
  useEffect(() => {
    if (granted) {
      void refetch();
    }
  }, [granted, refetch]);

  // `list_providers` is the truth: once it reads the instance connected, the
  // host hears it, once.
  const connected = Boolean(
    providers.data?.find(p => p.name === provider.name)?.connected,
  );
  const reported = useRef(false);
  useEffect(() => {
    if (connected && !reported.current) {
      reported.current = true;
      onConnected?.();
    }
  }, [connected, onConnected]);

  if (granted || connected) {
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
          {waitingNote}
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
        Opens a new tab. What you entered here stays.
      </Text>
    </Flex>
  );
}

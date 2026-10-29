import { Alert, Flex, Text } from '@backstage/ui';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';

import type { WorkspaceDraft } from '../../lib/workspaceDraft';
import {
  providerDisplayName,
  WORKSPACE_MANAGER_SERVER,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';
import { ProviderConnectAction } from '../ProviderConnectPrompt';

/**
 * A sign-in the editor needs before its form is any use: the person's muster
 * session to workspace-manager, or the provider instances the workspace reads.
 */
export type EditorGate =
  { kind: 'sign-in' } | { kind: 'connect'; providers: WorkspaceProvider[] };

/**
 * Which sign-in, if any, comes before the form. Creating needs one connected
 * provider instance (a source on another one gets its own prompt); editing
 * needs every instance the workspace's sources read, since its preview and
 * repository lists read them all.
 */
export function editorGate({
  needsManagerSignIn,
  providers,
  draft,
  isEdit,
}: {
  needsManagerSignIn: boolean;
  providers: WorkspaceProvider[];
  draft: WorkspaceDraft | undefined;
  isEdit: boolean;
}): EditorGate | undefined {
  if (needsManagerSignIn) {
    return { kind: 'sign-in' };
  }
  if (!draft || providers.length === 0) {
    return undefined;
  }
  const needed = isEdit
    ? providers.filter(p => draft.sources.some(s => s.provider === p.name))
    : providers;
  const unconnected = needed.filter(p => !p.connected);
  if (
    unconnected.length === 0 ||
    (!isEdit && unconnected.length < needed.length)
  ) {
    return undefined;
  }
  return { kind: 'connect', providers: unconnected };
}

export type WorkspaceEditorGateProps = {
  gate: EditorGate;
  installation: string;
};

/**
 * The one sign-in the editor asks for in place of its form, and why: muster's
 * sign-in of the person to workspace-manager, or the grant of a provider
 * instance's App in muster, which workspace-manager reads the repositories
 * with.
 */
export function WorkspaceEditorGate({
  gate,
  installation,
}: WorkspaceEditorGateProps) {
  const names =
    gate.kind === 'connect'
      ? gate.providers.map(providerDisplayName).join(' and ')
      : undefined;
  return (
    <Alert
      status="info"
      title="Sign in to use workspaces"
      data-testid="workspace-editor-gate"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            {names
              ? `A workspace reads its repositories from ${names} as you, with your own sign-in.`
              : `A workspace reads its repositories with your own sign-in, and you have not signed in to workspaces on ${installation} yet.`}{' '}
            Sign in once; the editor opens here.
          </Text>
          {gate.kind === 'sign-in' ? (
            <ServerSignIn
              noun="connector"
              serverName={WORKSPACE_MANAGER_SERVER}
              installation={installation}
            />
          ) : (
            gate.providers.map(provider => (
              <div
                key={provider.name}
                data-testid={`provider-connect-${provider.name}`}
              >
                <ProviderConnectAction
                  installation={installation}
                  provider={provider}
                />
              </div>
            ))
          )}
        </Flex>
      }
    />
  );
}

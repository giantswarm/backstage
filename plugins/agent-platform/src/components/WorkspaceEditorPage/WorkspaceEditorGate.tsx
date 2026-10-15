import { Alert, Flex, Text } from '@backstage/ui';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';

import type { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import type { WorkspaceDraft } from '../../lib/workspaceDraft';
import {
  providerDisplayName,
  WORKSPACE_MANAGER_SERVER,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';
import { ProviderConnectPrompt } from '../ProviderConnectPrompt';

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
  client: WorkspaceManagerClient | undefined;
  onRecheckProviders: () => void;
};

/** The sign-in the editor asks for in place of its form, and why. */
export function WorkspaceEditorGate({
  gate,
  installation,
  client,
  onRecheckProviders,
}: WorkspaceEditorGateProps) {
  if (gate.kind === 'sign-in') {
    return (
      <Alert
        status="warning"
        title="Sign in to workspace-manager first"
        data-testid="workspace-editor-gate"
        description={
          <Flex direction="column" gap="2">
            <Text variant="body-small">
              Workspaces are read and saved through workspace-manager, reached
              through muster as you. Your muster session on {installation} is
              not signed in to it yet, so the editor cannot read the
              repositories or save. Sign in, and the editor opens here.
            </Text>
            <ServerSignIn
              noun="connector"
              serverName={WORKSPACE_MANAGER_SERVER}
              installation={installation}
            />
          </Flex>
        }
      />
    );
  }
  const names = gate.providers.map(providerDisplayName).join(' and ');
  return (
    <Flex direction="column" gap="3" data-testid="workspace-editor-gate">
      <Text variant="body-medium">
        A workspace selects repositories from {names}, read as you with your own
        sign-in. Connect first; the editor opens here once you have.
      </Text>
      {client &&
        gate.providers.map(provider => (
          <ProviderConnectPrompt
            key={provider.name}
            client={client}
            provider={provider}
            onRecheck={onRecheckProviders}
          />
        ))}
    </Flex>
  );
}

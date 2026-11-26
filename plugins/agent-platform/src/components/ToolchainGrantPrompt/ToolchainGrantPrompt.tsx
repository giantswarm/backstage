import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/core-plugin-api';
import {
  externalUrlConsentApiRef,
  safeWebURL,
  NewTabLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { useQueryClient } from '@tanstack/react-query';

import { musterToolchainManagerQueryKey } from '../../lib/queryKeys';
import {
  grantProviders,
  type ToolchainAnswer,
} from '../../lib/toolchainManager';
import type { WorkspaceProvider } from '../../lib/workspaceManager';
import { ProviderConnectPrompt } from '../ProviderConnectPrompt';

export type ToolchainGrantPromptProps = {
  installation: string;
  /** A toolchain-manager answer; nothing renders without a `status`. */
  answer: ToolchainAnswer | undefined;
  /**
   * Called once the grant lands, after every toolchain read of the
   * installation is refreshed: a write that answered with the grant runs
   * again here.
   */
  onConnected?: () => void;
};

/**
 * What the toolchain-manager answered instead of its data. `grant_required`:
 * muster's sign-in for each App it names, the same prompt a workspace's
 * provider grant uses; once every one is granted, every toolchain read of the
 * installation runs again. Any other status (the App to install on a repository first, or one
 * this page does not know) says the manager's own message, with the install
 * page where it names one, so an answer is never a blank.
 */
export function ToolchainGrantPrompt({
  installation,
  answer,
  onConnected,
}: ToolchainGrantPromptProps) {
  const queryClient = useQueryClient();
  const consentApi = useApi(externalUrlConsentApiRef);
  if (!answer?.status) {
    return null;
  }
  const providers = grantProviders(answer);
  if (providers.length > 0) {
    return (
      <GrantPrompts
        installation={installation}
        providers={providers}
        message={answer.message}
        onConnected={async () => {
          await queryClient.invalidateQueries({
            queryKey: musterToolchainManagerQueryKey(installation),
          });
          onConnected?.();
        }}
      />
    );
  }
  const installURL = safeWebURL(answer.installURL);
  return (
    <Alert
      status="warning"
      title={
        answer.status === 'install_required'
          ? 'Install the toolchain-manager’s GitHub App on the repository first'
          : 'The toolchain-manager could not do this as you'
      }
      description={
        <Flex direction="column" gap="1">
          <Text variant="body-small">
            {answer.message ?? `It answered ${answer.status}.`}
          </Text>
          {installURL && (
            <div>
              <Button
                variant="secondary"
                size="small"
                onPress={() =>
                  void consentApi.open({
                    url: installURL,
                    requester: 'toolchain-manager',
                  })
                }
              >
                <NewTabLabel>Install the App</NewTabLabel>
              </Button>
            </div>
          )}
        </Flex>
      }
    />
  );
}

/**
 * One sign-in per App muster names, each on its own; `onConnected` once
 * every one is granted here.
 */
function GrantPrompts({
  installation,
  providers,
  message,
  onConnected,
}: {
  installation: string;
  providers: WorkspaceProvider[];
  message?: string;
  onConnected: () => void;
}) {
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const allGranted = providers.every(provider => granted.has(provider.name));
  const reported = useRef(false);
  useEffect(() => {
    if (allGranted && !reported.current) {
      reported.current = true;
      onConnected();
    }
  }, [allGranted, onConnected]);
  return (
    <Flex direction="column" gap="2">
      {providers.map(provider => (
        <ProviderConnectPrompt
          key={provider.name}
          installation={installation}
          provider={provider}
          title={
            providers.length > 1
              ? `Allow the toolchain-manager to read the toolchain sources as you (${provider.name})`
              : 'Allow the toolchain-manager to read the toolchain sources as you'
          }
          lead={`Toolchains are read from their source repositories, and a new one is opened as your pull request, with your own GitHub access${
            message ? `: ${message}` : '.'
          }`}
          waitingNote={
            providers.length > 1
              ? 'Finish in the other tab. The toolchains appear here once every App above is granted.'
              : 'Finish in the other tab. The toolchains appear here as soon as you are back.'
          }
          onConnected={() =>
            setGranted(prev => new Set(prev).add(provider.name))
          }
        />
      ))}
    </Flex>
  );
}

import { Alert, Flex, Link, Text } from '@backstage/ui';
import { safeWebURL } from '@giantswarm/backstage-plugin-ui-react';
import { useQueryClient } from '@tanstack/react-query';

import { musterToolchainManagerQueryKey } from '../../lib/queryKeys';
import {
  grantProvider,
  type ToolchainAnswer,
} from '../../lib/toolchainManager';
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
 * muster's sign-in for its GitHub App, the same prompt a workspace's provider
 * grant uses, after which every toolchain read of the installation runs
 * again. Any other status (the App to install on a repository first, or one
 * this page does not know) says the manager's own message, with the install
 * page where it names one, so an answer is never a blank.
 */
export function ToolchainGrantPrompt({
  installation,
  answer,
  onConnected,
}: ToolchainGrantPromptProps) {
  const queryClient = useQueryClient();
  if (!answer?.status) {
    return null;
  }
  const provider = grantProvider(answer);
  if (provider) {
    return (
      <ProviderConnectPrompt
        installation={installation}
        provider={provider}
        title="Allow the toolchain-manager to read the toolchain sources as you"
        lead={`Toolchains are read from their source repositories, and a new one is opened as your pull request, with your own GitHub access${
          answer.message ? `: ${answer.message}` : '.'
        }`}
        waitingNote="Finish in the other tab. The toolchains appear here as soon as you are back."
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
            <Link href={installURL} target="_blank" rel="noopener">
              Install the App
            </Link>
          )}
        </Flex>
      }
    />
  );
}

import { useQueryClient } from '@tanstack/react-query';

import { musterToolchainsQueryKey } from '../../lib/queryKeys';
import {
  grantProvider,
  type ToolchainAnswer,
} from '../../lib/toolchainManager';
import { ProviderConnectPrompt } from '../ProviderConnectPrompt';

export type ToolchainGrantPromptProps = {
  installation: string;
  /** A toolchain-manager answer; nothing renders unless it is `grant_required`. */
  answer: ToolchainAnswer | undefined;
};

/**
 * In place of the toolchains while the toolchain-manager cannot read the
 * sources as the person: muster's sign-in for its GitHub App, the same
 * prompt a workspace's provider grant uses. The toolchain reads run again
 * once the grant lands.
 */
export function ToolchainGrantPrompt({
  installation,
  answer,
}: ToolchainGrantPromptProps) {
  const queryClient = useQueryClient();
  const provider = grantProvider(answer);
  if (!provider) {
    return null;
  }
  return (
    <ProviderConnectPrompt
      installation={installation}
      provider={provider}
      title="Allow the toolchain-manager to read the toolchain sources as you"
      lead={`Toolchains are read from their source repositories, and a new one is opened as your pull request, with your own GitHub access${
        answer?.message ? `: ${answer.message}` : '.'
      }`}
      waitingNote="Finish in the other tab. The toolchains appear here as soon as you are back."
      onConnected={() =>
        queryClient.invalidateQueries({
          queryKey: musterToolchainsQueryKey(installation),
        })
      }
    />
  );
}

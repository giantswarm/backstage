import {
  ModelConfig,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';

/** muster's provider App that holds a person's ChatGPT login. */
export const CHATGPT_PROVIDER_APP = 'chatgpt';

export type ChatGptConnection = {
  /**
   * The agent's model is a person's own ChatGPT login: each turn runs on the
   * subscription the person connected. False while the ModelConfig is not
   * read, and when the person may not read it.
   */
  isPersonalModel: boolean;
  /**
   * A turn may not be sent yet: the model is the person's ChatGPT login and
   * muster does not report the person connected (or has not answered yet).
   */
  blocksTurn: boolean;
  /** The ModelConfig or the person's connection is still being read. */
  isLoading: boolean;
};

/**
 * Whether the person can talk to an agent whose model may be their own
 * ChatGPT subscription: the agent's ModelConfig, by a targeted read of its
 * namespace (the fleet-wide list is admin-only), and the person's `chatgpt`
 * state in muster's `auth://status`, shared with every sign-in affordance of
 * the installation, so a connection made in the dialog lets the turn go at
 * once.
 *
 * A ModelConfig the person may not read is no gate: the credential provider
 * refuses the turn then, and its reason is the turn's failure.
 */
export function useChatGptConnection(
  installation: string | undefined,
  modelConfig: { namespace?: string; name?: string } | undefined,
): ChatGptConnection {
  const { resource, isLoading: isModelLoading } = useResource(
    installation ?? '',
    ModelConfig,
    {
      name: modelConfig?.name ?? '',
      namespace: modelConfig?.namespace,
      enableDiscovery: false,
    },
    {
      enabled: Boolean(
        installation && modelConfig?.name && modelConfig.namespace,
      ),
    },
  );
  const isPersonalModel = Boolean(resource?.isPersonalChatGptLogin());
  const signIn = useServerSignIn(
    CHATGPT_PROVIDER_APP,
    isPersonalModel ? installation : undefined,
    { noun: 'connector', app: true },
  );
  const isStatusLoading = isPersonalModel && !signIn.status;
  return {
    isPersonalModel,
    blocksTurn: isPersonalModel && !signIn.isConnected,
    isLoading: isModelLoading || isStatusLoading,
  };
}

import {
  AssistantRuntimeProvider,
  makeAssistantTool,
  tool,
} from '@assistant-ui/react';
import { Content, Header, Page } from '@backstage/core-components';
import {
  useApi,
  identityApiRef,
  discoveryApiRef,
} from '@backstage/core-plugin-api';
import { Thread } from './Thread';
import { useCallback } from 'react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import useAsync from 'react-use/esm/useAsync';
import { z } from 'zod';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';

export const AiChatPage = () => {
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);

  const { value: apiUrl } = useAsync(async () => {
    const baseUrl = await discoveryApi.getBaseUrl('ai-chat');

    return `${baseUrl}/chat`;
  }, [discoveryApi]);

  const getHeaders = useCallback(async () => {
    const { token } = await identityApi.getCredentials();

    return {
      Authorization: `Bearer ${token}`,
    };
  }, [identityApi]);

  const kubernetesAuthTool = tool({
    description: 'Authenticate to access Kubernetes resources',
    parameters: z.object({
      clusterName: z.string(),
    }),
    execute: async ({ clusterName }) => {
      const cluster = await kubernetesApi.getCluster(clusterName);

      if (!cluster) {
        return {};
      }

      const { authProvider, oidcTokenProvider } = cluster;
      const credentials = await kubernetesAuthProvidersApi.getCredentials(
        authProvider === 'oidc'
          ? `${authProvider}.${oidcTokenProvider}`
          : authProvider,
      );

      return {
        success: true,
        message: 'Authenticated to access Kubernetes resources',
        clusterName,
        token: credentials.token,
      };
    },
  });

  const KubernetesAuthTool = makeAssistantTool({
    ...kubernetesAuthTool,
    toolName: 'kubernetesAuth',
  });

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: apiUrl,
      headers: getHeaders,
    }),
  });

  return (
    <Page themeId="tool">
      <Header title="AI Chat" subtitle="Chat with AI assistant" />
      <Content>
        <AssistantRuntimeProvider runtime={runtime}>
          <KubernetesAuthTool />
          <Thread />
        </AssistantRuntimeProvider>
      </Content>
    </Page>
  );
};

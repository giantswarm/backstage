import { useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useApi } from '@backstage/core-plugin-api';
import type { JsonValue } from '@backstage/types';
import {
  scaffolderApiRef,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import type {
  ScaffolderScaffoldResponse,
  TemplateParameterSchema,
} from '@backstage/plugin-scaffolder-common';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  mintTemplateTokens,
  templateTokens,
} from '../OIDCToken/templateTokens';

/**
 * Starts the template's task with the entries the person submits. The
 * template's cluster tokens are minted at this point rather than while the
 * form was filled, since by the time the person selects Create those may have
 * expired. A declined or failed sign-in rejects and nothing is started.
 */
export function useStartTemplateTask(
  templateRef: string,
  manifest: TemplateParameterSchema | undefined,
) {
  const scaffolderApi = useApi(scaffolderApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);
  const { secrets } = useTemplateSecrets();
  // The template wizard page is outside every plugin's QueryClientProvider.
  const [queryClient] = useState(() => new QueryClient());

  return useTrackedMutation<
    ScaffolderScaffoldResponse,
    Error,
    Record<string, JsonValue>
  >(
    {
      mutationFn: async values => {
        const tokens = await mintTemplateTokens(
          manifest ? templateTokens(manifest, values) : [],
          kubernetesApi,
          kubernetesAuthProvidersApi,
        );
        return scaffolderApi.scaffold({
          templateRef,
          values,
          secrets: { ...secrets, ...tokens },
        });
      },
      event: () => ({ name: 'Scaffolder.taskStarted', attributes: {} }),
    },
    queryClient,
  );
}

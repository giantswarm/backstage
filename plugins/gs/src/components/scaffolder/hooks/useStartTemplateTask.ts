import { useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useApi } from '@backstage/core-plugin-api';
import type { JsonValue } from '@backstage/types';
import {
  scaffolderApiRef,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import type { ScaffolderScaffoldResponse } from '@backstage/plugin-scaffolder-common';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

/**
 * Starts the template's task with the entries the person submits and the
 * secrets the form collected. The scaffolder API mints the template's cluster
 * tokens on the way.
 */
export function useStartTemplateTask(templateRef: string) {
  const scaffolderApi = useApi(scaffolderApiRef);
  const { secrets } = useTemplateSecrets();
  // The template wizard page is outside every plugin's QueryClientProvider.
  const [queryClient] = useState(() => new QueryClient());

  return useTrackedMutation<
    ScaffolderScaffoldResponse,
    Error,
    Record<string, JsonValue>
  >(
    {
      mutationFn: values =>
        scaffolderApi.scaffold({ templateRef, values, secrets }),
      event: () => ({ name: 'Scaffolder.taskStarted', attributes: {} }),
    },
    queryClient,
  );
}

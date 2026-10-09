import { useMemo } from 'react';
import {
  Harness,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { useAgentManagerInfo } from './useAgentManager';
import {
  DEFAULT_PLATFORM_HARNESS,
  harnessChoicesOf,
  type HarnessChoice,
} from '../lib/harnesses';

/**
 * The Harnesses an agent can be created on in `namespace`, read with the
 * person's own RBAC, and the platform Harness agent-manager uses when a
 * request names none.
 */
export function useHarnessChoices(
  installation: string | undefined,
  namespace: string | undefined,
): {
  choices: HarnessChoice[];
  platformHarness: string;
  platformChoice: HarnessChoice | undefined;
  errors: unknown[];
  isLoading: boolean;
} {
  const { info } = useAgentManagerInfo(installation);
  const platformHarness = info?.harness?.name || DEFAULT_PLATFORM_HARNESS;

  const { resources, errors, isLoading } = useResources(
    installation ? [installation] : [],
    Harness,
    installation && namespace ? { [installation]: { namespace } } : {},
    {
      enabled: Boolean(installation && namespace),
      enableDiscovery: false,
    },
  );
  const choices = useMemo(
    () =>
      namespace ? harnessChoicesOf(resources, namespace, platformHarness) : [],
    [resources, namespace, platformHarness],
  );
  const platformChoice = choices.find(
    choice => choice.name === platformHarness,
  );

  return { choices, platformHarness, platformChoice, errors, isLoading };
}

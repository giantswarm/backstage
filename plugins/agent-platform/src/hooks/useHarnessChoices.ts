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
 * The Harnesses of `namespace` on `installation` an agent can be created on,
 * read with the person's own RBAC, and which of them is the platform Harness
 * agent-manager composes when a request names none.
 *
 * `platformChoice` is `undefined` while the list loads, when it could not be
 * read, or when the platform Harness is not among those listed.
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

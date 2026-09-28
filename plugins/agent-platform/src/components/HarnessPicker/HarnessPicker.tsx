import { useMemo } from 'react';
import { FieldLabel, Flex, Text } from '@backstage/ui';
import {
  Harness,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import {
  DEFAULT_PLATFORM_HARNESS,
  harnessChoicesOf,
  runtimeLabel,
} from '../../lib/harnesses';
import { useNewAgentForm } from '../NewAgentFormProvider';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

/**
 * The runtime an agent runs on: the Harnesses of the chosen model's namespace
 * that admit agents by the harness label, read with the person's own RBAC.
 *
 * Shown only when there is a choice to make. A namespace holding the platform
 * Harness alone — coding Harnesses are off by default — renders nothing, and
 * so does a list the person may not read or that failed: the agent then runs
 * on the platform Harness, as it would with no pick.
 */
export function HarnessPicker() {
  const classes = useSelectableCardStyles();
  const { state, selectHarness } = useNewAgentForm();
  const { installation, modelConfigNamespace: namespace } = state;
  const { info } = useAgentManagerInfo(installation);
  const platformHarness = info?.harness?.name || DEFAULT_PLATFORM_HARNESS;

  const { resources } = useResources(
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

  if (choices.length < 2) {
    return null;
  }

  const selected = state.harness?.admits ?? platformHarness;

  return (
    <Flex direction="column" gap="2">
      <FieldLabel
        label="Runtime"
        secondaryLabel="Harness"
        description={`What runs the agent. The Harnesses of ${namespace} on ${installation}; the platform Harness unless you pick another. It cannot be changed after the agent is created.`}
      />
      <SelectableCardGrid role="radiogroup" ariaLabel="Runtime" minWidth={220}>
        {choices.map(choice => {
          const isPlatform = choice.admits === platformHarness;
          return (
            <SelectableCard
              key={choice.name}
              role="radio"
              selected={choice.admits === selected}
              ariaLabel={`Run on the Harness ${choice.name}`}
              onSelect={() => selectHarness(isPlatform ? undefined : choice)}
            >
              <Text weight="bold">{runtimeLabel(choice.runtime)}</Text>
              {isPlatform && (
                <Text variant="body-small" color="secondary">
                  Platform default
                </Text>
              )}
              <Text variant="body-x-small" color="secondary">
                Harness <span className={classes.code}>{choice.name}</span>
                {choice.imageName && (
                  <>
                    {' · '}
                    <span className={classes.code}>{choice.imageName}</span>
                  </>
                )}
              </Text>
            </SelectableCard>
          );
        })}
      </SelectableCardGrid>
    </Flex>
  );
}

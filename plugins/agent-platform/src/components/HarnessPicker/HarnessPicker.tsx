import { useMemo } from 'react';
import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import {
  Harness,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import {
  DEFAULT_PLATFORM_HARNESS,
  harnessChoicesOf,
  harnessTitle,
  type HarnessChoice,
} from '../../lib/harnesses';
import { useNewAgentForm } from '../NewAgentFormProvider';
import {
  SelectableCard,
  SelectableCardGrid,
  StaticCard,
  useSelectableCardStyles,
} from '../SelectableCard';

/**
 * The runtime an agent runs on: the Harnesses of the chosen model's namespace
 * that admit agents by the harness label, read with the person's own RBAC.
 *
 * Several Harnesses are radio cards; a namespace holding one (the platform
 * Harness alone, since coding Harnesses are off by default) shows it as a
 * read-only card, so the person still sees what will run the agent. A list
 * that could not be read says so, since a choice may have been missed; a pick
 * dropped by a later model or installation change says so too.
 */
export function HarnessPicker() {
  const classes = useSelectableCardStyles();
  const { state, selectHarness } = useNewAgentForm();
  const {
    installation,
    modelConfigNamespace: namespace,
    droppedHarness,
  } = state;
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

  if (!installation || !namespace) {
    return null;
  }

  const hasChoice = choices.length > 1;
  const couldNotRead = !isLoading && choices.length === 0 && errors.length > 0;

  const dropNotice = droppedHarness ? (
    <div role="status">
      <Alert
        status="info"
        title="Runtime back to the platform default"
        description={`You picked the Harness ${droppedHarness} for a different namespace. The agent now runs on the platform Harness${
          hasChoice ? ' unless you pick a runtime again below' : ''
        }.`}
      />
    </div>
  ) : null;

  if (choices.length === 0) {
    if (!couldNotRead && !dropNotice) {
      return null;
    }
    return (
      <Flex direction="column" gap="2">
        {dropNotice}
        {couldNotRead && (
          <Alert
            status="warning"
            title="Couldn't read the runtimes"
            description={`The Harnesses in ${namespace} on ${installation} couldn't be read, so the agent will run on the platform Harness. You may not have permission to list Harnesses there.`}
          />
        )}
      </Flex>
    );
  }

  const selected = state.harness?.admits ?? platformHarness;
  const content = (choice: HarnessChoice) => (
    <>
      <Text weight="bold">{harnessTitle(choice)}</Text>
      {choice.admits === platformHarness && (
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
    </>
  );

  return (
    <Flex direction="column" gap="2">
      <FieldLabel
        label="Runtime"
        secondaryLabel="Harness"
        description={
          hasChoice
            ? "What runs the agent. It can't be changed once the agent exists."
            : `What runs the agent: the only Harness in ${namespace} on ${installation}.`
        }
      />
      {dropNotice}
      {hasChoice ? (
        <SelectableCardGrid
          role="radiogroup"
          ariaLabel="Runtime"
          minWidth={220}
        >
          {choices.map(choice => {
            const isPlatform = choice.admits === platformHarness;
            return (
              <SelectableCard
                key={choice.name}
                role="radio"
                selected={choice.admits === selected}
                ariaLabel={`${harnessTitle(choice)}, Harness ${choice.name}${
                  isPlatform ? ', platform default' : ''
                }`}
                onSelect={() => selectHarness(isPlatform ? undefined : choice)}
              >
                {content(choice)}
              </SelectableCard>
            );
          })}
        </SelectableCardGrid>
      ) : (
        <SelectableCardGrid role="list" ariaLabel="Runtime" minWidth={220}>
          <StaticCard>{content(choices[0])}</StaticCard>
        </SelectableCardGrid>
      )}
    </Flex>
  );
}

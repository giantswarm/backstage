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
 * The runtime an agent runs on: the Harnesses of the chosen model's namespace,
 * read with the person's own RBAC. The agent names the one picked in
 * `spec.harnessRef`.
 *
 * Several Harnesses are radio cards; a namespace holding one (the platform
 * Harness alone, since coding Harnesses are off by default) shows it as a
 * read-only card, so the person still sees what will run the agent. A list
 * that could not be read, fully or in part, says so, since a choice may have
 * been missed; a pick dropped by a later model or installation change says so
 * too.
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
        title="Runtime reset to the platform default"
        description={`The Harness ${droppedHarness} you picked doesn't serve this model's namespace, so the agent runs on the platform Harness${
          hasChoice ? '. Pick another runtime below to change that' : ''
        }.`}
      />
    </div>
  ) : null;

  if (isLoading && choices.length === 0) {
    return (
      <Flex direction="column" gap="2">
        <FieldLabel
          label="Runtime"
          secondaryLabel="Harness"
          description="What runs the agent."
        />
        {dropNotice}
        <Text color="secondary">Loading runtimes…</Text>
      </Flex>
    );
  }

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

  // Picking the platform Harness sends no `harness`; any other card is sent
  // by its name.
  const platformChoice = choices.find(
    choice => choice.name === platformHarness,
  );
  const selected = state.harness?.name ?? platformChoice?.name;
  const content = (choice: HarnessChoice) => {
    return (
      <>
        <Text weight="bold">{harnessTitle(choice)}</Text>
        {choice.name === platformHarness && (
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
  };

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
      {errors.length > 0 && (
        <Alert
          status="warning"
          title="Some runtimes couldn't be loaded; the list may be incomplete."
        />
      )}
      {hasChoice ? (
        <SelectableCardGrid
          role="radiogroup"
          ariaLabel="Runtime"
          minWidth={220}
        >
          {choices.map(choice => (
            <SelectableCard
              key={choice.name}
              role="radio"
              selected={choice.name === selected}
              ariaLabel={`${harnessTitle(choice)}, Harness ${choice.name}${
                choice.name === platformHarness ? ', platform default' : ''
              }`}
              onSelect={() =>
                selectHarness(choice === platformChoice ? undefined : choice)
              }
            >
              {content(choice)}
            </SelectableCard>
          ))}
        </SelectableCardGrid>
      ) : (
        <SelectableCardGrid role="list" ariaLabel="Runtime" minWidth={220}>
          <StaticCard>{content(choices[0])}</StaticCard>
        </SelectableCardGrid>
      )}
    </Flex>
  );
}

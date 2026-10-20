import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';

import { useHarnessChoices } from '../../hooks/useHarnessChoices';
import { harnessTitle, type HarnessChoice } from '../../lib/harnesses';
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
  const { state, edit, selectHarness } = useNewAgentForm();
  const {
    installation,
    modelConfigNamespace: namespace,
    droppedHarness,
  } = state;
  const { choices, platformHarness, platformChoice, errors, isLoading } =
    useHarnessChoices(installation, namespace);

  if (!installation || !namespace) {
    return null;
  }

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

  // The edit page shows an existing agent's Harness without offering others:
  // moving it runs its own checks, from Change Harness on the agent's page.
  if (edit) {
    const currentName = edit.agent.harness ?? platformHarness;
    // Until (or unless) the namespace's Harnesses are read, it is known by
    // its name alone.
    const current = choices.find(choice => choice.name === currentName) ?? {
      name: currentName,
      displayName: currentName,
    };
    return (
      <Flex direction="column" gap="2">
        <FieldLabel
          label="Runtime"
          secondaryLabel="Harness"
          description="What runs the agent. Change it with Change Harness in the Agent actions menu on the agent's page."
        />
        <SelectableCardGrid role="list" ariaLabel="Runtime" minWidth={220}>
          <StaticCard>{content(current)}</StaticCard>
        </SelectableCardGrid>
      </Flex>
    );
  }

  const hasChoice = choices.length > 1;
  const couldNotRead = !isLoading && choices.length === 0 && errors.length > 0;

  const dropNotice = droppedHarness ? (
    <div role="status">
      <Alert
        status="info"
        title="Runtime reset to the platform default"
        description={`The Harness ${droppedHarness} does not serve this model's namespace, so the agent runs on the platform Harness${
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
          description="Choose what runs the agent."
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
            title="Could not read the runtimes"
            description={`The Harnesses in ${namespace} on ${installation} could not be read — you may lack permission — so the agent runs on the platform Harness.`}
          />
        )}
      </Flex>
    );
  }

  // Picking the platform Harness sends no `harness`; any other card is sent
  // by its name.
  const selected = state.harness?.name ?? platformChoice?.name;
  return (
    <Flex direction="column" gap="2">
      <FieldLabel
        label="Runtime"
        secondaryLabel="Harness"
        description={
          hasChoice
            ? "Choose what runs the agent. You can change it later from the agent's page."
            : `The only Harness in ${namespace} on ${installation} runs the agent.`
        }
      />
      {dropNotice}
      {errors.length > 0 && (
        <Alert
          status="warning"
          title="Could not read some runtimes, so the list may be incomplete."
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

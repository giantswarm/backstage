import { useMemo, useState } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import {
  CapabilityState,
  Definition,
  Installation,
  VerifyResult,
} from '../apis';
import { count, upToDate } from '../lib/comparison';
import {
  choiceLabel,
  choiceValue,
  getAt,
  labelOf,
  personChoices,
} from '../lib/schemaForm';
import { CapabilityDialog } from './CapabilityDialog';
import { ComparisonView } from './ComparisonView';
import { ErrorAlert } from './ErrorAlert';
import { useComparison } from './queries';
import { StateTag, statusOf } from './StateTag';

const CARD_STYLE = {
  border: '1px solid rgba(128,128,128,0.3)',
  borderRadius: 6,
  padding: 16,
};

/** The one button: Enable when not installed, Apply changes while the comparison finds differences, none when up to date. */
function buttonOf(
  installed: boolean,
  result?: VerifyResult,
): 'Enable' | 'Apply changes' | undefined {
  if (!installed) {
    return 'Enable';
  }
  return result && upToDate(result) ? undefined : 'Apply changes';
}

/** Whether the capability is on the installation, as the manager says; older managers say it through the state. */
function isInstalled(capability: CapabilityState): boolean {
  return capability.enabled ?? capability.state !== 'not enabled';
}

/**
 * One line per choice the definition leaves to a person that has a value --
 * read back, typed or the schema's default -- from the comparison's inputs;
 * the choices without one as one line naming each, as the manager names
 * them (`inputs.unset`), so a reader sees which choices the record lacks.
 */
function Choices({
  definition,
  comparison,
}: {
  definition?: Definition;
  comparison?: VerifyResult;
}) {
  const choices = useMemo(
    () => personChoices(definition?.inputSchema ?? {}),
    [definition],
  );
  const values = comparison?.inputs?.values ?? {};
  const chosen = choices
    .map(field => ({
      field,
      value: getAt(values, field.path) ?? field.default,
    }))
    .filter(c => c.value !== undefined && c.value !== null);
  const unset = comparison?.inputs?.unset ?? [];
  return (
    <>
      {chosen.map(({ field, value }) => (
        <Text
          key={field.name}
          variant="body-small"
          data-testid={`choice-${field.name}`}
        >
          {choiceLabel(field)}: {choiceValue(field, value)}
        </Text>
      ))}
      {unset.length > 0 && (
        <Text
          variant="body-small"
          color="secondary"
          data-testid="choices-unset"
        >
          {count(unset.length, 'choice')} not on record:{' '}
          {unset.map(name => labelOf(name, choices)).join(', ')}
        </Text>
      )}
    </>
  );
}

/** The one line with the manager's reason a commit would be refused, in its words. */
function CommitRefused({ reason }: { reason: string }) {
  return (
    <Text variant="body-small" color="secondary" data-testid="commit-refused">
      {reason}
    </Text>
  );
}

/**
 * One capability of an installation as one block: the header line with the
 * state and what the comparison found, why the comparison did not run where
 * the definition refused, the person's choices, the features with
 * differences (opening to them), the features with planned changes, the
 * features as defined, the checks that did not run, and one button --
 * Enable, or Apply changes -- opening the dialog. The button is disabled,
 * with the manager's reason on one line under it, while the comparison says
 * the manager would refuse the commit -- except where the only refusal is
 * the choices not on record: the dialog is where they are made, so the
 * button stays and the line says which. The comparison runs when the tab opens.
 */
export function CapabilityCard({
  installation,
  capability,
  definition,
}: {
  installation: Installation;
  capability: CapabilityState;
  definition?: Definition;
}) {
  const [dialog, setDialog] = useState(false);
  const comparison = useComparison(installation.name, capability.name);
  const result = comparison.data;
  const installed = isInstalled(capability);
  const inFlight =
    capability.state === 'pending approval' ||
    capability.state === 'rolling out';
  const commitRefused = result?.commitRefused;
  // The manager refuses a commit without the required choices; the dialog
  // collects them, so that refusal alone never disables the way to it.
  const onlyMissingChoices =
    Boolean(result) &&
    !result?.refused &&
    (result?.inputs?.missing?.length ?? 0) > 0;
  const refusedForNow = Boolean(commitRefused) && !onlyMissingChoices;
  const status = statusOf(capability, result);
  const button = buttonOf(installed, result);

  return (
    <Flex
      direction="column"
      gap="2"
      style={CARD_STYLE}
      data-testid={`capability-${capability.name}`}
    >
      <Flex gap="3" align="center" justify="between">
        <Flex gap="2" align="center">
          <Text variant="title-small" as="h3">
            {capability.name}
          </Text>
          <StateTag
            state={capability.state}
            status={status}
            testId="capability-state"
          />
        </Flex>
        {button && (
          <Button
            variant="primary"
            size="small"
            onPress={() => setDialog(true)}
            isDisabled={
              inFlight || refusedForNow || (installed && comparison.isPending)
            }
          >
            {button}
          </Button>
        )}
      </Flex>
      {commitRefused && <CommitRefused reason={commitRefused} />}
      {result?.refused && (
        <Text variant="body-small" data-testid="not-compared">
          The comparison did not run: {result.refused}
        </Text>
      )}
      <Choices definition={definition} comparison={result} />
      {comparison.isPending && (
        <Text variant="body-small" color="secondary" data-testid="comparing">
          Comparing with the definition…
        </Text>
      )}
      {comparison.error && (
        <ErrorAlert
          title="The comparison did not run"
          error={comparison.error as Error}
        />
      )}
      {result && installed && !result.refused && (
        <ComparisonView result={result} />
      )}
      {dialog && (
        <CapabilityDialog
          kind={installed ? 'reconcile' : 'enable'}
          installation={installation}
          capability={capability}
          definition={definition}
          comparison={result}
          isOpen
          onClose={() => setDialog(false)}
        />
      )}
    </Flex>
  );
}

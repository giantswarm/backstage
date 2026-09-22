import { useMemo, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import RefreshIcon from '@material-ui/icons/Refresh';
import {
  CapabilityState,
  Definition,
  Installation,
  VerifyResult,
} from '../apis';
import { count, upToDate } from '../lib/comparison';
import { reasonOf, refusalStatus } from '../lib/refusal';
import {
  choiceLabel,
  choiceValue,
  fieldsOf,
  formOf,
  getAt,
  labelOf,
  personChoices,
} from '../lib/schemaForm';
import { CapabilityDialog } from './CapabilityDialog';
import { ComparisonView } from './ComparisonView';
import { ErrorAlert } from './ErrorAlert';
import { Loading } from './Loading';
import { useComparison, useRefreshComparison } from './queries';
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
 * One line per choice the definition leaves to a person that has a value on
 * the comparison's inputs -- read back from the record or given -- and never
 * the schema's default, which is what an unmade choice would come to, not
 * what is on record: no line shows a value the comparison later changes, and
 * without a comparison there is no record to show. The choices without a
 * value as one line naming each, as the manager names them (`inputs.unset`),
 * so a reader sees which choices the record lacks.
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
      value: getAt(values, field.path),
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
 * state and what the comparison found; where the definition refused, the
 * manager's reason as an Alert -- `info` for an input the dialog supplies,
 * `warning` for something to fix first -- with *Comparing…* and a failed
 * request in the same place, above the record; the person's choices; the
 * features with differences (opening to them), the features with planned
 * changes, the features as defined, the checks that did not run; and one
 * button -- Enable, or Apply changes -- opening the dialog. The button is
 * disabled while the comparison says the manager would refuse the commit for
 * something to fix first, the reason on one line under it where the
 * definition itself did not refuse; a refusal for an input the dialog
 * supplies -- the choices not on record, a value the reason names -- keeps
 * the button, the dialog being where it is given. The comparison runs when
 * the tab opens; while it runs -- then, and again after Refresh -- the card
 * is the header and the indicator, the record appearing once, complete, when
 * it lands, so no value flips and no line is inserted above one already read.
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
  const refresh = useRefreshComparison(installation.name, capability.name);
  // In flight -- the first run and every refresh -- the card holds the record
  // back rather than showing one the comparison is about to replace.
  const comparing = comparison.isFetching;
  const result = comparing ? undefined : comparison.data;
  const schema = definition?.inputSchema;
  const fields = useMemo(() => fieldsOf(formOf(schema ?? {})), [schema]);
  const installed = isInstalled(capability);
  const inFlight =
    capability.state === 'pending approval' ||
    capability.state === 'rolling out';
  const refused = result?.refused;
  const commitRefused = result?.commitRefused;
  // The manager copies the definition's refusal into commitRefused: one
  // reason, read once -- the Alert where the definition refused, the line
  // under the button where the commit alone would be.
  const refusal =
    result && reasonOf(result) ? refusalStatus(result, fields) : undefined;
  const refusedForNow = refusal === 'warning';
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
        <Flex gap="2" align="center">
          <Button
            variant="tertiary"
            size="small"
            iconStart={<RefreshIcon />}
            aria-label="Refresh comparison"
            onPress={refresh}
            isDisabled={comparing}
          >
            Refresh
          </Button>
          {button && (
            <Button
              variant="primary"
              size="small"
              onPress={() => setDialog(true)}
              isDisabled={inFlight || refusedForNow || (installed && comparing)}
            >
              {button}
            </Button>
          )}
        </Flex>
      </Flex>
      {refused && refusal && (
        <Alert
          status={refusal}
          icon
          description={refused}
          data-testid="refused"
        />
      )}
      {comparing && (
        <Loading label="Comparing with the definition…" testId="comparing" />
      )}
      {!comparing && comparison.error && (
        <ErrorAlert
          title="The comparison did not run"
          error={comparison.error as Error}
        />
      )}
      {commitRefused && !refused && <CommitRefused reason={commitRefused} />}
      <Choices definition={definition} comparison={result} />
      {result && installed && !refused && <ComparisonView result={result} />}
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

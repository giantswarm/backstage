import { CSSProperties, ReactNode, useId, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Text,
  VisuallyHidden,
} from '@backstage/ui';
import RefreshIcon from '@material-ui/icons/Refresh';
import {
  DateComponent,
  Fact,
  FactList,
  SectionHeader,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  CapabilityState,
  Definition,
  Installation,
  VerifyResult,
} from '../apis';
import { kindOf, verbOf } from '../lib/actions';
import { upToDate } from '../lib/comparison';
import { reasonOf, refusalStatus } from '../lib/refusal';
import {
  choiceDescription,
  choiceValue,
  Field,
  fieldsOf,
  formOf,
  getAt,
  labelOf,
  personForm,
} from '../lib/schemaForm';
import { CapabilityDialog } from './CapabilityDialog';
import { ComparisonView } from './ComparisonView';
import { ErrorAlert } from './ErrorAlert';
import { Loading } from './Loading';
import { useActions, useComparison, useRefreshComparison } from './queries';
import { StateTag, Status, statusOf } from './StateTag';
import { ActionStateTag } from './ActionStateTag';

/** The header's rows wrap under each other on a narrow screen instead of squeezing. */
const WRAP: CSSProperties = { flexWrap: 'wrap' };

/** The name stays one word: on a narrow screen the state wraps under it, the name does not break at its hyphen. */
const NAME_STYLE: CSSProperties = { whiteSpace: 'nowrap' };

/** An element that lends its id to another's description without taking a box of its own. */
const CONTENTS: CSSProperties = { display: 'contents' };

/** The card's status, resolved once. */
interface CardStatus extends Status {
  /** Whether the capability is on the installation, as the manager says; older managers say it through the state. */
  installed: boolean;
  /** The one button: Enable when not installed, Apply changes while the comparison finds differences, none when up to date. */
  button?: 'Enable' | 'Apply changes';
}

/**
 * The header's words and mark, whether the capability is on the
 * installation and the one button, read from the same facts in one place,
 * so the header never says one thing and the button another.
 */
function cardStatusOf(
  capability: CapabilityState,
  result?: VerifyResult,
): CardStatus {
  const installed = capability.enabled ?? capability.state !== 'not enabled';
  const status = statusOf(capability, result);
  let button: CardStatus['button'] = 'Apply changes';
  if (!installed) {
    button = 'Enable';
  } else if (result && upToDate(result)) {
    button = undefined;
  }
  return { ...status, installed, button };
}

/** A region of the card, named by its header: the record, the comparison. */
function Region({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <SectionHeader id={id} title={title} as="h4" variant="title-x-small" />
      {children}
    </section>
  );
}

/** A choice's value on the record, or the mark that it is not on it, with what the choice is about under it. */
function Choice({
  name,
  value,
  description,
}: {
  name: string;
  value?: string;
  description?: string;
}) {
  return (
    <>
      <Text
        variant="body-medium"
        color={value === undefined ? 'secondary' : undefined}
        data-testid={`choice-${name}`}
      >
        {value ?? 'not on record'}
      </Text>
      {description && (
        <Text variant="body-small" color="secondary">
          {description}
        </Text>
      )}
    </>
  );
}

/** One row of the record: a choice by name, its field where the form has one, its value where the record has one. */
interface Row {
  name: string;
  field?: Field;
  value?: unknown;
}

/**
 * What is on record, as a list of the choices the definition leaves to a
 * person: each with its value on the comparison's inputs -- read back from
 * the record or given -- and never the schema's default, which is what an
 * unmade choice would come to, not what is on record; a choice without a
 * value marked in place as not on record, as the manager names them
 * (`inputs.unset`), so a reader sees which the record lacks; under each,
 * what the choice is about, from the definition. Every row's label is
 * unique among the rows: one another row shares is qualified with its group
 * (Portal domain, Grafana domain). No line shows a value the comparison
 * later changes, and without a comparison there is no record to show.
 */
function Record({
  definition,
  comparison,
}: {
  definition?: Definition;
  comparison?: VerifyResult;
}) {
  const schema = definition?.inputSchema;
  const form = useMemo(() => personForm(formOf(schema ?? {})), [schema]);
  const choices = useMemo(() => fieldsOf(form), [form]);
  const values = comparison?.inputs?.values;
  if (!values) {
    return null;
  }
  const unset = comparison.inputs?.unset ?? [];
  const rows: Row[] = [];
  for (const field of choices) {
    const value = getAt(values, field.path);
    if (value !== undefined && value !== null) {
      rows.push({ name: field.name, field, value });
    } else if (unset.includes(field.name)) {
      rows.push({ name: field.name, field });
    }
  }
  // A choice the manager lists that no field of the form carries: a list of
  // objects, or a field the schema does not know.
  for (const name of unset) {
    if (!choices.some(c => c.name === name)) {
      rows.push({ name });
    }
  }
  if (rows.length === 0) {
    return null;
  }
  const names = rows.map(row => row.name);
  const facts: Fact[] = rows.map(({ name, field, value }) => ({
    label: labelOf(name, choices, names),
    value: (
      <Choice
        name={name}
        value={
          field && value !== undefined && value !== null
            ? choiceValue(field, value)
            : undefined
        }
        description={field && choiceDescription(field, form)}
      />
    ),
  }));
  return (
    <Region title="On record" testId="record">
      <FactList facts={facts} maxWidth={null} />
    </Region>
  );
}

/**
 * The card's last line: the capability's last action as `list_installations`
 * names it -- its verb from the action's name, the capability, its state --
 * and when it was asked, from the installation's history, which the tab
 * reads once for the cards and the log alike; or *No action yet*.
 */
function LastAction({
  installation,
  capability,
}: {
  installation: string;
  capability: CapabilityState;
}) {
  const last = capability.lastAction;
  const actions = useActions(installation);
  const createdAt =
    last && actions.data?.actions.find(a => a.name === last.name)?.createdAt;
  return (
    <Text variant="body-medium" data-testid="last-action">
      {last ? (
        <>
          <Text as="span" variant="body-medium" color="secondary">
            Last action:{' '}
          </Text>
          {verbOf(kindOf(last.name))} {capability.name}
          {last.result && (
            <>
              {' · '}
              <ActionStateTag state={last.result} />
            </>
          )}
          {createdAt && (
            <>
              {' · '}
              <DateComponent value={createdAt} relative />
            </>
          )}
        </>
      ) : (
        <Text as="span" variant="body-medium" color="secondary">
          No action yet
        </Text>
      )}
    </Text>
  );
}

/** The one line with the manager's reason a commit would be refused, in its words; its id is the disabled button's description. */
function CommitRefused({ id, reason }: { id: string; reason: string }) {
  return (
    <Text
      id={id}
      variant="body-small"
      color="secondary"
      data-testid="commit-refused"
    >
      {reason}
    </Text>
  );
}

/**
 * One capability of an installation as one card: the header line with the
 * state and what the comparison found; where the definition refused, the
 * manager's reason as an Alert -- `info` for an input the dialog supplies,
 * `warning` for something to fix first -- with *Comparing…* and a failed
 * request in the same place, above the record; then two regions, *On
 * record* -- the person's choices -- and *Compared with the definition* --
 * the features with differences, the files with their diffs, the features
 * with planned changes, the features as defined, the checks that did not
 * run; and one button -- Enable, or Apply changes -- opening the dialog. The
 * button is disabled while the comparison says the manager would refuse the
 * commit for something to fix first, the reason on one line under it where
 * the definition itself did not refuse; a refusal for an input the dialog
 * supplies -- the choices not on record, a value the reason names -- keeps
 * the button, the dialog being where it is given. Whatever disables the
 * button -- the reason, the phase in flight, the comparison running -- is
 * the button's accessible description. The comparison runs when the tab
 * opens; while it runs -- then, and again after Refresh -- the card is the
 * header and the indicator, the record appearing once, complete, when it
 * lands, so no value flips and no line is inserted above one already read;
 * as it lands, a status region announces the outcome in the header's words.
 * The last line names the capability's last action, or that there is none.
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
  const stateId = useId();
  const reasonId = useId();
  const comparingId = useId();
  const comparison = useComparison(installation.name, capability.name);
  const refresh = useRefreshComparison(installation.name, capability.name);
  // In flight -- the first run and every refresh -- the card holds the record
  // back rather than showing one the comparison is about to replace.
  const comparing = comparison.isFetching;
  const result = comparing ? undefined : comparison.data;
  const schema = definition?.inputSchema;
  const fields = useMemo(() => fieldsOf(formOf(schema ?? {})), [schema]);
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
  const { installed, button, ...status } = cardStatusOf(capability, result);
  // Why the button is disabled, by the id of the element saying so: the
  // phase in flight in the header, the manager's reason under the button,
  // the comparison still running.
  let disabledBy: string | undefined;
  if (inFlight) {
    disabledBy = stateId;
  } else if (refusedForNow) {
    disabledBy = reasonId;
  } else if (installed && comparing) {
    disabledBy = comparingId;
  }
  // What the card announces once the comparison settles: the outcome in the
  // header's words, or that it did not run; nothing while it runs, so the
  // next outcome is announced even when it reads the same.
  let outcome = '';
  if (!comparing && comparison.error) {
    outcome = `${capability.name}: the comparison did not run`;
  } else if (result) {
    outcome = `${capability.name} compared: ${status.words}`;
  }

  return (
    <Card data-testid={`capability-${capability.name}`}>
      <CardHeader>
        <Flex gap="3" align="center" justify="between" style={WRAP}>
          <Flex gap="2" align="center" style={WRAP}>
            <Text variant="title-small" as="h3" style={NAME_STYLE}>
              {capability.name}
            </Text>
            <span id={stateId} style={CONTENTS}>
              <StateTag
                state={capability.state}
                status={status}
                testId="capability-state"
              />
            </span>
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
                isDisabled={disabledBy !== undefined}
                aria-describedby={disabledBy}
              >
                {button}
              </Button>
            )}
          </Flex>
        </Flex>
      </CardHeader>
      <CardBody>
        <Flex direction="column" gap="4">
          {refused && refusal && (
            <Alert
              id={reasonId}
              status={refusal}
              icon
              description={refused}
              data-testid="refused"
            />
          )}
          {comparing && (
            <Loading
              id={comparingId}
              label="Comparing with the definition…"
              testId="comparing"
            />
          )}
          {!comparing && comparison.error && (
            <ErrorAlert
              title="The comparison did not run"
              error={comparison.error as Error}
            />
          )}
          {commitRefused && !refused && (
            <CommitRefused id={reasonId} reason={commitRefused} />
          )}
          <Record definition={definition} comparison={result} />
          {result && installed && !refused && (
            <Region title="Compared with the definition" testId="compared">
              <ComparisonView result={result} />
            </Region>
          )}
          <LastAction
            installation={installation.name}
            capability={capability}
          />
        </Flex>
        <VisuallyHidden role="status" data-testid="comparison-outcome">
          {outcome}
        </VisuallyHidden>
      </CardBody>
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
    </Card>
  );
}

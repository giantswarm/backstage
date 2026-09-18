import { CSSProperties, ReactNode, useState } from 'react';
import { Alert, Button, Flex, Skeleton, Text } from '@backstage/ui';
import { type UseQueryResult } from '@tanstack/react-query';
import { DefinitionFeature, Installation, VerifyResult } from '../apis';
import {
  Cell,
  cellOf,
  countMarks,
  flattenInputs,
  InstallationReadability,
} from './consistency';
import { DimensionItem, LIST_STYLE } from './DimensionItem';
import { ErrorAlert } from './ErrorAlert';
import { PlatformCapabilitiesProviders } from './Providers';
import { useInstallations, useManagerInfo } from './queries';
import { StateTag } from './StateTag';
import { useConsistency } from './useConsistency';

export interface ConsistencyViewProps {
  /** The capability whose definition the installations are compared with. */
  capability: string;
  /**
   * How the portal reads each installation as the signed-in person. A row
   * the person may not read shows its live dimensions as *not readable*, not
   * as drift. Without it every row shows the manager's marks as they are.
   */
  readability?: (installation: string) => InstallationReadability;
}

const UNKNOWN: InstallationReadability = { state: 'unknown' };

const TABLE_STYLE: CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
};
const CELL_STYLE: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid rgba(128,128,128,0.3)',
  textAlign: 'left',
  verticalAlign: 'top',
};
const PLAIN_BUTTON: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

type Expanded = { installation: string; feature?: string } | undefined;

/** The dotted inputs as a definition list: the definition's own names, one line each. */
function Inputs({ leaves }: { leaves: [string, string][] }) {
  if (leaves.length === 0) {
    return (
      <Text variant="body-small" color="secondary">
        No inputs.
      </Text>
    );
  }
  return (
    <dl
      data-testid="consistency-inputs"
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        columnGap: 12,
        rowGap: 2,
      }}
    >
      {leaves.map(([key, value]) => (
        <div key={key} style={{ display: 'contents' }}>
          <dt>
            <Text variant="body-small" color="secondary">
              {key}
            </Text>
          </dt>
          <dd style={{ margin: 0 }}>
            <Text variant="body-small">{value}</Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A row expanded: the installation's inputs on record, or one feature's dimensions. */
function Panel({
  row,
  capability,
  result,
  feature,
  cell,
}: {
  row: Installation;
  capability: string;
  result?: VerifyResult;
  feature?: DefinitionFeature;
  cell?: Cell;
}) {
  if (feature) {
    return (
      <Flex direction="column" gap="2">
        <Flex gap="2" align="center">
          <Text variant="body-medium" weight="bold">
            {feature.title ?? feature.id} on {row.name}
          </Text>
          {cell && <StateTag state={cell.mark} />}
        </Flex>
        {feature.description && (
          <Text variant="body-small" color="secondary">
            {feature.description}
          </Text>
        )}
        {cell?.dimensions.length ? (
          <ul style={LIST_STYLE} data-testid="consistency-dimensions">
            {cell.dimensions.map(dimension => (
              <DimensionItem key={dimension.id} dimension={dimension} />
            ))}
          </ul>
        ) : (
          <Text variant="body-small" color="secondary">
            No dimension of this feature was checked.
          </Text>
        )}
      </Flex>
    );
  }
  // The inputs the comparison rendered from; before it answered, the record
  // `list_installations` carries for the capability.
  const onRecord = row.capabilities.find(c => c.name === capability)?.inputs;
  const leaves = flattenInputs(
    result?.inputs?.values ??
      (onRecord as unknown as Record<string, unknown> | undefined),
  );
  return (
    <Flex direction="column" gap="2">
      <Flex gap="2" align="center">
        <Text variant="body-medium" weight="bold">
          Inputs on record: {result?.inputs?.source ?? 'the record'}
        </Text>
        {result?.state && <StateTag state={result.state} />}
      </Flex>
      {result?.refused && (
        <Alert
          status="danger"
          title="Refused by the definition"
          description={result.refused}
        />
      )}
      {!row.readable && (
        <Alert
          status="warning"
          title="Repositories not readable as you"
          description={
            (row.errors ?? []).join('; ') ||
            "The installation's repositories could not be read with your grant."
          }
        />
      )}
      <Inputs leaves={leaves} />
    </Flex>
  );
}

function Row({
  row,
  capability,
  features,
  query,
  readability,
  expanded,
  onToggle,
}: {
  row: Installation;
  capability: string;
  features: DefinitionFeature[];
  query: UseQueryResult<VerifyResult, Error>;
  readability: InstallationReadability;
  expanded: Expanded;
  onToggle: (next: Expanded) => void;
}) {
  const readable = readability.state !== 'not readable';
  const result = query.data;
  const cells = new Map<string, Cell>(
    (result?.features ?? []).map(f => [f.id, cellOf(f, readable)]),
  );
  const open = expanded?.installation === row.name;
  const toggle = (feature?: string) =>
    onToggle(
      open && expanded?.feature === feature
        ? undefined
        : { installation: row.name, feature },
    );
  const columns = features.length + 2;

  let marks: ReactNode;
  if (query.isError) {
    marks = (
      <td style={CELL_STYLE} colSpan={features.length}>
        <Text
          variant="body-small"
          color="secondary"
          data-testid={`consistency-error-${row.name}`}
        >
          Verify failed: {query.error.message}
        </Text>
      </td>
    );
  } else if (!result) {
    marks = features.map(feature => (
      <td key={feature.id} style={CELL_STYLE}>
        <Skeleton width={90} height={16} />
      </td>
    ));
  } else {
    marks = features.map(feature => {
      const cell = cells.get(feature.id);
      const mark = cell?.mark ?? 'not checked';
      return (
        <td key={feature.id} style={CELL_STYLE}>
          <button
            type="button"
            style={PLAIN_BUTTON}
            data-testid={`consistency-cell-${row.name}-${feature.id}`}
            data-mark={mark}
            aria-expanded={open && expanded?.feature === feature.id}
            aria-label={`${feature.title ?? feature.id} on ${row.name}: ${mark}`}
            onClick={() => toggle(feature.id)}
          >
            <StateTag state={mark} />
          </button>
        </td>
      );
    });
  }

  return (
    <>
      <tr data-testid={`consistency-row-${row.name}`}>
        <td style={CELL_STYLE}>
          <Flex direction="column" gap="1">
            <button
              type="button"
              style={PLAIN_BUTTON}
              aria-expanded={open && !expanded?.feature}
              onClick={() => toggle(undefined)}
            >
              <Text variant="body-small" weight="bold">
                {row.name}
              </Text>
              {row.hub && (
                <Text variant="body-small" color="secondary">
                  hub
                </Text>
              )}
            </button>
            {!readable && (
              <span title={readability.reason}>
                <StateTag
                  state="not readable"
                  testId={`consistency-readability-${row.name}`}
                />
              </span>
            )}
          </Flex>
        </td>
        {marks}
        <td style={CELL_STYLE}>
          <Button
            variant="secondary"
            size="small"
            onPress={() => query.refetch()}
            isDisabled={query.isFetching}
            aria-label={`Verify ${row.name} now`}
          >
            {query.isFetching ? 'Verifying…' : 'Verify now'}
          </Button>
        </td>
      </tr>
      {open && (
        <tr data-testid={`consistency-panel-${row.name}`}>
          <td style={CELL_STYLE} colSpan={columns}>
            <Panel
              row={row}
              capability={capability}
              result={result}
              feature={features.find(f => f.id === expanded?.feature)}
              cell={expanded?.feature ? cells.get(expanded.feature) : undefined}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ConsistencyTable({
  capability,
  rows,
  unreadable,
  features,
  readability,
}: {
  capability: string;
  rows: Installation[];
  unreadable: string[];
  features: DefinitionFeature[];
  readability: (installation: string) => InstallationReadability;
}) {
  const queries = useConsistency(
    rows.map(row => row.name),
    capability,
  );
  const [expanded, setExpanded] = useState<Expanded>();

  const compared = queries.filter(q => q.isSuccess).length;
  const counts = countMarks(
    queries.flatMap((q, i) =>
      (q.data?.features ?? []).map(f =>
        cellOf(f, readability(rows[i].name).state !== 'not readable'),
      ),
    ),
  );
  const summary = Object.entries(counts)
    .map(([mark, n]) => `${n} ${mark}`)
    .join(', ');

  return (
    <Flex direction="column" gap="2">
      <Text
        variant="body-small"
        color="secondary"
        data-testid="consistency-summary"
      >
        {rows.length + unreadable.length} installations, {compared} compared
        {summary ? ` — ${summary}` : ''}
      </Text>
      <div style={{ overflowX: 'auto' }}>
        <table style={TABLE_STYLE} data-testid={`consistency-${capability}`}>
          <thead>
            <tr>
              <th scope="col" style={CELL_STYLE}>
                Installation
              </th>
              {features.map(feature => (
                <th
                  key={feature.id}
                  scope="col"
                  style={CELL_STYLE}
                  title={feature.description}
                  data-testid={`consistency-column-${feature.id}`}
                >
                  {feature.title ?? feature.id}
                </th>
              ))}
              <th scope="col" style={CELL_STYLE}>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Row
                key={row.name}
                row={row}
                capability={capability}
                features={features}
                query={queries[i]}
                readability={readability(row.name)}
                expanded={expanded}
                onToggle={setExpanded}
              />
            ))}
            {unreadable.map(name => (
              <tr key={name} data-testid={`consistency-row-${name}`}>
                <td style={CELL_STYLE}>
                  <Flex direction="column" gap="1">
                    <Text variant="body-small" weight="bold">
                      {name}
                    </Text>
                    <StateTag
                      state="not readable"
                      testId={`consistency-readability-${name}`}
                    />
                  </Flex>
                </td>
                <td style={CELL_STYLE} colSpan={features.length + 1}>
                  <Text variant="body-small" color="secondary">
                    The registry record could not be read as you.
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Flex>
  );
}

function Consistency({
  capability,
  readability = () => UNKNOWN,
}: ConsistencyViewProps) {
  const listing = useInstallations();
  const info = useManagerInfo();

  if (listing.isPending || info.isPending) {
    return <Skeleton width={480} height={120} />;
  }
  const error = (listing.error ?? info.error) as Error | null;
  if (error) {
    return <ErrorAlert title="giantswarm-platform-manager" error={error} />;
  }
  const definition = info.data?.definitions.find(d => d.name === capability);
  if (!definition) {
    return (
      <Alert
        status="info"
        title="No such capability"
        description={`The platform manager defines no capability named ${capability}.`}
      />
    );
  }
  return (
    <ConsistencyTable
      capability={capability}
      rows={listing.data?.installations ?? []}
      unreadable={listing.data?.unreadable ?? []}
      features={definition.features ?? []}
      readability={readability}
    />
  );
}

/**
 * The Consistency view of a capability: one row per installation of the
 * registry, opted in or not, the hub among them; one column per feature of
 * the definition; each cell the feature's mark from `verify_capability` --
 * *as defined*, *differs by input*, *drifted* (or *not checked*, with the
 * manager's reason). A cell expands to its dimensions and the differences, a
 * row to the installation's inputs on record. The comparison runs when the
 * view opens, a few rows at a time, is kept for the session, and *Verify
 * now* runs it again for one installation. No schedule: the manager compares
 * when asked, as the signed-in person.
 */
export function ConsistencyView(props: ConsistencyViewProps) {
  return (
    <PlatformCapabilitiesProviders>
      <Consistency {...props} />
    </PlatformCapabilitiesProviders>
  );
}

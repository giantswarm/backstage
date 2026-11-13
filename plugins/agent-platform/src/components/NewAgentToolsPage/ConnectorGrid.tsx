import { useMemo, useState } from 'react';
import {
  Flex,
  SearchField,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import {
  CatalogNoMatch,
  matchesQuery,
  isSearchableList,
  ShowMore,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  bucketLabel,
  countNoun,
  MAX_INLINE_SELECTORS,
  connectionLabel,
  shownConnection,
  type ServerBucket,
} from '../../lib/toolset';
import {
  type ConnectorChoice,
  type ConnectorState,
  connectorState,
  connectorStatus,
  type ConnectorStatus,
  readOnlyFits,
  readOnlySelectors,
  unlistedPicks,
} from './connectorChoice';

/** Connectors shown before *Show more*: a few rows of the two-column grid. */
export const INITIAL_CONNECTORS = 12;

const useStyles = makeStyles(theme => ({
  grid: {
    display: 'grid',
    gap: theme.spacing(1.25),
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
  },
  chosen: {
    borderColor: theme.palette.primary.main,
  },
  name: {
    minWidth: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  },
  access: {
    marginTop: 'auto',
  },
}));

/** What the connector offers, or why it lists no tools. */
function toolsLine(
  bucket: ServerBucket,
  status: ConnectorStatus,
  readOnlyCount: number,
  state: ConnectorState,
): string {
  if (bucket.needsSignIn) {
    return 'You can choose All now. Its tools show after you sign in.';
  }
  const connection = shownConnection(bucket);
  if (connection) {
    const label = connectionLabel(connection);
    if (state.choice === 'all') {
      return connection === 'deactivated'
        ? `${label}: all, once activated`
        : `${label}: all, once connected`;
    }
    return state.unlisted > 0
      ? `${label}: ${countNoun(state.unlisted, 'chosen tool')} not listed`
      : `${label}: no tools listed`;
  }
  if (bucket.tools.length === 0) {
    return status.reach === 'connected'
      ? 'It lists no tools right now.'
      : 'It lists no tools while it is not connected.';
  }
  const total = countNoun(bucket.tools.length, 'tool');
  return readOnlyCount > 0 ? `${total}, ${readOnlyCount} read-only` : total;
}

/** Why *Read-only* cannot be picked, where the tools line does not say it. */
function readOnlyUnavailable(
  bucket: ServerBucket,
  readOnlyCount: number,
): string | undefined {
  if (bucket.needsSignIn || bucket.tools.length === 0) {
    return undefined;
  }
  if (readOnlyCount === 0) {
    return 'None of its tools only read, so Read-only cannot be picked.';
  }
  if (!readOnlyFits(bucket)) {
    return `Its read-only tools are more than the ${MAX_INLINE_SELECTORS} an agent may list one by one, so choose All.`;
  }
  return undefined;
}

/** How much of the connector the toolset holds, or nothing when none. */
function selectionLine(
  bucket: ServerBucket,
  { choice, picked, unlisted }: ConnectorState,
): string | undefined {
  switch (choice) {
    case 'all':
      return 'Selected: all tools, including ones added later.';
    case 'read-only':
      return `Selected: ${countNoun(picked, 'read-only tool')}.`;
    case 'partial':
      if (unlisted > 0) {
        return `Selected: ${countNoun(picked + unlisted, 'tool')}. Tools added later are not included.`;
      }
      return `Selected: ${picked} of ${countNoun(
        bucket.tools.length,
        'tool',
      )}. Tools added later are not included.`;
    default:
      return undefined;
  }
}

function ConnectorCard({
  bucket,
  connectors,
  selected,
  disabled,
  onChoose,
}: {
  bucket: ServerBucket;
  /** Every connector, to tell whose its unlisted picks are. */
  connectors: readonly ServerBucket[];
  selected: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (
    bucket: ServerBucket,
    choice: Exclude<ConnectorChoice, 'partial'>,
  ) => void;
}) {
  const classes = useStyles();
  const state = connectorState(
    bucket,
    selected,
    unlistedPicks(bucket, selected, connectors).length,
  );
  const { choice } = state;
  const readOnlyCount = readOnlySelectors(bucket).length;
  const name = bucketLabel(bucket);
  const status = connectorStatus(bucket);
  const unavailable = readOnlyUnavailable(bucket, readOnlyCount);
  const selection = selectionLine(bucket, state);
  const checked = <CheckIcon aria-hidden />;
  return (
    <div
      role="group"
      aria-label={`Connector ${name}`}
      className={`${classes.card} ${choice === 'none' ? '' : classes.chosen}`}
    >
      <Flex direction="column" gap="1" className={classes.name}>
        <Text weight="bold">{name}</Text>
        <StatusDot tone={status.tone} label={status.label} />
        <Text variant="body-small" color="secondary">
          {toolsLine(bucket, status, readOnlyCount, state)}
        </Text>
        {unavailable && (
          <Text variant="body-small" color="secondary">
            {unavailable}
          </Text>
        )}
        {selection && (
          <Text variant="body-small" weight="bold">
            {selection}
          </Text>
        )}
      </Flex>
      <div className={classes.access}>
        <ToggleButtonGroup
          aria-label={`Access to ${name}`}
          selectionMode="single"
          isDisabled={disabled}
          selectedKeys={
            choice === 'read-only' || choice === 'all' ? [choice] : []
          }
          onSelectionChange={keys => {
            const next = [...keys][0];
            onChoose(
              bucket,
              next === 'read-only' || next === 'all' ? next : 'none',
            );
          }}
        >
          <ToggleButton
            id="read-only"
            size="small"
            iconStart={choice === 'read-only' ? checked : undefined}
            // Read-only access is the tools that read today, one by one: none
            // to list before a sign-in, none at all, or more than fit inline.
            isDisabled={
              bucket.needsSignIn || readOnlyCount === 0 || !readOnlyFits(bucket)
            }
          >
            Read-only
          </ToggleButton>
          <ToggleButton
            id="all"
            size="small"
            iconStart={choice === 'all' ? checked : undefined}
          >
            All
          </ToggleButton>
        </ToggleButtonGroup>
      </div>
    </div>
  );
}

/**
 * *Which apps?*: every connector with its state, its tool count and two
 * choices. *Read-only* picks the tools it marks read-only today, *All* the
 * whole connector (`server:x`, so tools it adds later too). Tools picked one
 * by one in the catalogue show as a count, neither choice checked. A page at a
 * time, with a search (names and tags) from `SEARCH_MIN` connectors on.
 */
export function ConnectorGrid({
  connectors,
  selected,
  disabled,
  onChoose,
}: {
  connectors: ServerBucket[];
  selected: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (
    bucket: ServerBucket,
    choice: Exclude<ConnectorChoice, 'partial'>,
  ) => void;
}) {
  const classes = useStyles();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  // Kept while a search is in force, so it can still be cleared.
  const isSearchable = isSearchableList(connectors.length, trimmed !== '');
  const matching = useMemo(
    () =>
      trimmed === ''
        ? connectors
        : connectors.filter(
            bucket =>
              matchesQuery(trimmed, bucket.name) ||
              matchesQuery(trimmed, bucketLabel(bucket)) ||
              (bucket.tags ?? []).some(tag => matchesQuery(trimmed, tag)),
          ),
    [connectors, trimmed],
  );

  return (
    <Flex direction="column" gap="2">
      {isSearchable && (
        <SearchField
          aria-label="Search connectors"
          placeholder="Search connectors…"
          value={query}
          onChange={setQuery}
        />
      )}
      {matching.length === 0 ? (
        <CatalogNoMatch plural="connectors" search={trimmed} />
      ) : (
        <ShowMore
          key={trimmed}
          items={matching}
          initial={INITIAL_CONNECTORS}
          noun="connector"
        >
          {visible => (
            <div className={classes.grid}>
              {visible.map(bucket => (
                <ConnectorCard
                  key={bucket.name}
                  bucket={bucket}
                  connectors={connectors}
                  selected={selected}
                  disabled={disabled}
                  onChoose={onChoose}
                />
              ))}
            </div>
          )}
        </ShowMore>
      )}
    </Flex>
  );
}

import { useMemo, useState } from 'react';
import {
  Flex,
  SearchField,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  matchesQuery,
  SEARCH_MIN,
  ShowMore,
} from '@giantswarm/backstage-plugin-ui-react';

import { countNoun, type ServerBucket } from '../../lib/toolset';
import {
  type ConnectorChoice,
  connectorState,
  readOnlyFits,
  readOnlySelectors,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
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
    overflowWrap: 'anywhere',
  },
}));

/** What sits under a connector's name: its tools, and how much is picked. */
function connectorLine(
  bucket: ServerBucket,
  choice: ConnectorChoice,
  picked: number,
) {
  if (bucket.needsSignIn) {
    return choice === 'all'
      ? 'All, once signed in'
      : 'Sign in to list its tools';
  }
  const total = countNoun(bucket.tools.length, 'tool');
  if (choice === 'all') {
    return `${total} · also ones added later`;
  }
  if (choice === 'partial') {
    return `${picked} of ${total} selected`;
  }
  return total;
}

function ConnectorCard({
  bucket,
  selected,
  disabled,
  onChoose,
}: {
  bucket: ServerBucket;
  selected: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (
    bucket: ServerBucket,
    choice: Exclude<ConnectorChoice, 'partial'>,
  ) => void;
}) {
  const classes = useStyles();
  const { choice, picked } = connectorState(bucket, selected);
  const readOnlyCount = readOnlySelectors(bucket).length;
  const name = `${bucket.name}${bucket.isFamily ? ' (family)' : ''}`;
  return (
    <div
      role="group"
      aria-label={`Connector ${bucket.name}`}
      className={`${classes.card} ${choice === 'none' ? '' : classes.chosen}`}
    >
      <Flex direction="column" gap="0" className={classes.name}>
        <Text weight="bold">{name}</Text>
        <Text variant="body-small" color="secondary">
          {connectorLine(bucket, choice, picked)}
        </Text>
      </Flex>
      <ToggleButtonGroup
        aria-label={`Access to ${bucket.name}`}
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
          // Read-only access is the tools that read today, one by one: none
          // to list before a sign-in, none at all, or more than fit inline.
          isDisabled={
            bucket.needsSignIn || readOnlyCount === 0 || !readOnlyFits(bucket)
          }
        >
          Read-only
        </ToggleButton>
        <ToggleButton id="all" size="small">
          All
        </ToggleButton>
      </ToggleButtonGroup>
    </div>
  );
}

/**
 * *Which apps?*: every connector with its tool count and two choices —
 * *Read-only* picks the tools it marks read-only today, *All* the whole
 * connector (`server:x`, so tools it adds later too). Tools picked one by one
 * in the catalogue show as a count, neither choice checked. A page at a time,
 * with a search past {@link SEARCH_MIN} connectors.
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
  const isSearchable = connectors.length > SEARCH_MIN || trimmed !== '';
  const matching = useMemo(
    () =>
      trimmed === ''
        ? connectors
        : connectors.filter(bucket => matchesQuery(trimmed, bucket.name)),
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
        <Text color="secondary">No connector matches “{trimmed}”.</Text>
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

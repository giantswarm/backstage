import { useEffect, useState } from 'react';
import { Box } from '@material-ui/core';
import { SearchField, Text } from '@backstage/ui';
import {
  Autocomplete,
  SingleSelect,
} from '@giantswarm/backstage-plugin-ui-react';
import useDebounce from 'react-use/esm/useDebounce';

import type { QueueFilters } from '../../lib/rows';

type Option = { value: string; label: string };

/** The radio every choice offers first: the filter not set. */
const ANY = 'any';

/** A person stopped typing: the search narrows the table after this. */
const SEARCH_DEBOUNCE_MS = 300;

export type FilterChange = (
  name: keyof QueueFilters,
  value: string | undefined,
) => void;

export interface BotPrsFiltersProps {
  filters: QueueFilters;
  /** The teams in scope, for the team filter; one team offers no choice. */
  teams: string[];
  /** The repositories, bot kinds, classifications and dependencies the queue knows. */
  repositories: string[];
  kinds: string[];
  classifications: Option[];
  dependencies: string[];
  onChange: FilterChange;
}

/** One filter with a short fixed set of values, as radios. */
function Choice({
  label,
  name,
  value,
  items,
  onChange,
}: {
  label: string;
  name: keyof QueueFilters;
  value: string | undefined;
  items: Option[];
  onChange: FilterChange;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <SingleSelect
      label={label}
      items={[{ value: ANY, label: 'Any' }, ...items]}
      selected={value ?? ANY}
      onChange={selected =>
        onChange(name, !selected || selected === ANY ? undefined : selected)
      }
    />
  );
}

/** One filter with an open-ended list of values, as an autocomplete. */
function Picker({
  label,
  name,
  value,
  values,
  onChange,
}: {
  label: string;
  name: keyof QueueFilters;
  value: string | undefined;
  values: string[];
  onChange: FilterChange;
}) {
  const items = values.map(entry => ({ value: entry, label: entry }));
  // The URL may name a value the queue has not answered for yet.
  if (value && !items.some(item => item.value === value)) {
    items.push({ value, label: value });
  }
  if (items.length === 0) {
    return null;
  }
  return (
    <Box pt={1} pb={1}>
      <Autocomplete
        label={label}
        items={items}
        selectedValue={value ?? null}
        onChange={selected => onChange(name, selected ?? undefined)}
      />
    </Box>
  );
}

/** The queue's free-text search, applied once the person pauses. */
function Search({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: FilterChange;
}) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  useDebounce(
    () => {
      if (text !== (value ?? '')) {
        onChange('search', text || undefined);
      }
    },
    SEARCH_DEBOUNCE_MS,
    [text],
  );
  return (
    <Box pt={1} pb={1}>
      <Box mb={1}>
        <Text variant="body-small" weight="bold">
          Search
        </Text>
      </Box>
      <SearchField
        aria-label="Search"
        placeholder="Title, reference or evidence"
        value={text}
        onChange={setText}
        size="small"
      />
    </Box>
  );
}

/**
 * The queue's filters, one control each, in the column the Repositories and
 * Clusters pages use: the open-ended lists as autocompletes, the short fixed
 * sets as radio groups. The URL keeps them, and every one is applied on the
 * page, because marge answers a whole team in one call.
 */
export function BotPrsFilters({
  filters,
  teams,
  repositories,
  kinds,
  classifications,
  dependencies,
  onChange,
}: BotPrsFiltersProps) {
  return (
    <Box data-testid="bot-prs-filters">
      <Search value={filters.search} onChange={onChange} />
      {teams.length > 1 || filters.team ? (
        <Picker
          label="Team"
          name="team"
          value={filters.team}
          values={teams}
          onChange={onChange}
        />
      ) : null}
      <Picker
        label="Repository"
        name="repository"
        value={filters.repository}
        values={repositories}
        onChange={onChange}
      />
      <Choice
        label="Classification"
        name="classification"
        value={filters.classification}
        items={classifications}
        onChange={onChange}
      />
      <Choice
        label="Bot"
        name="kind"
        value={filters.kind}
        items={kinds.map(kind => ({ value: kind, label: kind }))}
        onChange={onChange}
      />
      <Picker
        label="Dependency"
        name="dependency"
        value={filters.dependency}
        values={dependencies}
        onChange={onChange}
      />
    </Box>
  );
}

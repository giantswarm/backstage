import { useEffect, useState } from 'react';
import {
  Box,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@material-ui/core';
import { SearchField, Text } from '@backstage/ui';
import {
  Autocomplete,
  SingleSelect,
} from '@giantswarm/backstage-plugin-ui-react';
import useDebounce from 'react-use/esm/useDebounce';
import { LIFECYCLES, ListFilters, Scope } from '../apis';

type SelectItem = { value: string; label: string };

/** The radio every choice offers first: the filter not set. */
const ANY = 'any';

const withAny = (items: SelectItem[]): SelectItem[] => [
  { value: ANY, label: 'Any' },
  ...items,
];

const RENOVATE = withAny([
  { value: 'configured', label: 'Configured' },
  { value: 'missing', label: 'Missing' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]);
const VISIBILITY = withAny([
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]);
const FORK = withAny([
  { value: 'true', label: 'Forks only' },
  { value: 'false', label: 'No forks' },
]);
const LIFECYCLE = withAny(
  LIFECYCLES.map(lifecycle => ({
    value: lifecycle,
    label: lifecycle[0].toUpperCase() + lifecycle.slice(1),
  })),
);

/** A person stopped typing: the search goes to the manager after this. */
const SEARCH_DEBOUNCE_MS = 300;

export type FilterChange = (
  name: keyof ListFilters,
  value: string | number | boolean | undefined,
) => void;

export interface RepositoriesFiltersProps {
  scope: Scope;
  filters: ListFilters;
  /** The archived repositories are listed (the URL's `archived=true`). */
  showArchived: boolean;
  /** The teams of the scope's whole inventory, for the Team options. */
  teams: string[];
  /** The finding kinds of the scope's whole inventory. */
  findingKinds: string[];
  onChange: FilterChange;
}

/** One `list_repositories` argument with a fixed set of values, as radios. */
function Choice({
  label,
  name,
  value,
  items,
  onChange,
}: {
  label: string;
  name: keyof ListFilters;
  value: string | undefined;
  items: SelectItem[];
  onChange: FilterChange;
}) {
  return (
    <SingleSelect
      label={label}
      items={items}
      selected={value ?? ANY}
      onChange={selected =>
        onChange(name, !selected || selected === ANY ? undefined : selected)
      }
    />
  );
}

/** The manager's name-or-description search, sent once the person pauses. */
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
        placeholder="Name or description"
        value={text}
        onChange={setText}
        size="small"
      />
    </Box>
  );
}

/**
 * The filters of `list_repositories`, one control each, in the layout the
 * Clusters page uses: the choices as radio groups, the long lists (teams,
 * finding kinds) as autocompletes whose options come from the scope's whole
 * inventory -- never from the rows a filter already narrowed. Under
 * *Unassigned* no row has a team, so the Team filter is not offered.
 */
export function RepositoriesFilters({
  scope,
  filters,
  showArchived,
  teams,
  findingKinds,
  onChange,
}: RepositoriesFiltersProps) {
  const teamItems = [
    ...(scope === 'all' ? [{ value: 'none', label: 'No team' }] : []),
    ...teams.map(team => ({ value: team, label: team })),
  ];
  // The URL may name a team the inventory has not answered for yet.
  if (filters.team && !teamItems.some(item => item.value === filters.team)) {
    teamItems.push({ value: filters.team, label: filters.team });
  }
  const findingItems = findingKinds.map(kind => ({ value: kind, label: kind }));
  if (
    filters.finding &&
    !findingItems.some(item => item.value === filters.finding)
  ) {
    findingItems.push({ value: filters.finding, label: filters.finding });
  }

  return (
    <Box data-testid="repositories-filters">
      <Search value={filters.search} onChange={onChange} />
      <Box pt={1} pb={1}>
        <FormControlLabel
          style={{ marginLeft: 0, marginRight: 0 }}
          control={
            <Switch
              checked={showArchived}
              onChange={event =>
                onChange('archived', event.target.checked ? true : undefined)
              }
              size="small"
              color="primary"
            />
          }
          label={<Typography variant="body2">Show archived</Typography>}
        />
      </Box>
      {scope !== 'unassigned' && (
        <Box pt={1} pb={1}>
          <Autocomplete
            label="Team"
            items={teamItems}
            selectedValue={filters.team ?? null}
            onChange={selected => onChange('team', selected ?? undefined)}
          />
        </Box>
      )}
      <Choice
        label="Lifecycle"
        name="lifecycle"
        value={filters.lifecycle}
        items={LIFECYCLE}
        onChange={onChange}
      />
      <Choice
        label="Renovate"
        name="renovate"
        value={filters.renovate}
        items={RENOVATE}
        onChange={onChange}
      />
      <Choice
        label="Visibility"
        name="visibility"
        value={filters.visibility}
        items={VISIBILITY}
        onChange={onChange}
      />
      <Choice
        label="Fork"
        name="fork"
        value={filters.fork === undefined ? undefined : String(filters.fork)}
        items={FORK}
        onChange={(name, value) =>
          onChange(name, value === undefined ? undefined : value === 'true')
        }
      />
      <Box pt={1} pb={1}>
        <Autocomplete
          label="Finding"
          items={findingItems}
          selectedValue={filters.finding ?? null}
          onChange={selected => onChange('finding', selected ?? undefined)}
        />
      </Box>
      <Box pt={1} pb={1}>
        <Box mb={1}>
          <Text variant="body-small" weight="bold">
            Inactive for (days)
          </Text>
        </Box>
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          type="number"
          inputProps={{ min: 0, 'aria-label': 'Inactive for (days)' }}
          placeholder="No commit by a person for…"
          value={filters.inactiveDays ?? ''}
          onChange={event =>
            onChange(
              'inactiveDays',
              event.target.value === ''
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      </Box>
    </Box>
  );
}

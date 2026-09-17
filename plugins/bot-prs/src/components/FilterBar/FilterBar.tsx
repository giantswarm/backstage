import { Grid, TextField } from '@material-ui/core';

import type { QueueFilters } from '../../lib/rows';

type Option = { value: string; label: string };

export interface FilterBarProps {
  filters: QueueFilters;
  /** The teams in scope, for the team filter; one team offers no choice. */
  teams: string[];
  /** The repositories, bot kinds, classifications and dependencies the queue knows. */
  repositories: string[];
  kinds: string[];
  classifications: Option[];
  dependencies: string[];
  onChange: (name: keyof QueueFilters, value: string | undefined) => void;
}

function Choice({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: keyof QueueFilters;
  value: string | undefined;
  options: Option[];
  onChange: FilterBarProps['onChange'];
}) {
  return (
    <Grid item xs={6} md={2}>
      <TextField
        select
        fullWidth
        size="small"
        id={`filter-${name}`}
        label={label}
        value={value ?? ''}
        SelectProps={{ native: true }}
        InputLabelProps={{ shrink: true }}
        onChange={event => onChange(name, event.target.value || undefined)}
      >
        <option value="">any</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </TextField>
    </Grid>
  );
}

const plain = (values: string[]): Option[] =>
  values.map(value => ({ value, label: value }));

/**
 * The queue's filters, one control each; the URL keeps them. Applied on the
 * page, because marge answers the whole team in one call.
 */
export function FilterBar({
  filters,
  teams,
  repositories,
  kinds,
  classifications,
  dependencies,
  onChange,
}: FilterBarProps) {
  return (
    <Grid container spacing={2} alignItems="flex-end">
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          size="small"
          id="filter-search"
          label="Search"
          placeholder="title, reference or evidence"
          value={filters.search ?? ''}
          InputLabelProps={{ shrink: true }}
          onChange={event =>
            onChange('search', event.target.value || undefined)
          }
        />
      </Grid>
      {teams.length > 1 || filters.team ? (
        <Choice
          label="Team"
          name="team"
          value={filters.team}
          options={plain(teams)}
          onChange={onChange}
        />
      ) : null}
      <Choice
        label="Repository"
        name="repository"
        value={filters.repository}
        options={plain(repositories)}
        onChange={onChange}
      />
      <Choice
        label="Classification"
        name="classification"
        value={filters.classification}
        options={classifications}
        onChange={onChange}
      />
      <Choice
        label="Bot"
        name="kind"
        value={filters.kind}
        options={plain(kinds)}
        onChange={onChange}
      />
      <Choice
        label="Dependency"
        name="dependency"
        value={filters.dependency}
        options={plain(dependencies)}
        onChange={onChange}
      />
    </Grid>
  );
}

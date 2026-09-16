import { Grid, TextField } from '@material-ui/core';
import { ListFilters } from '../apis';

type Option = { value: string; label: string };

const RENOVATE: Option[] = [
  { value: 'configured', label: 'configured' },
  { value: 'missing', label: 'missing' },
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'inactive' },
];
const VISIBILITY: Option[] = [
  { value: 'public', label: 'public' },
  { value: 'private', label: 'private' },
];
const FORK: Option[] = [
  { value: 'true', label: 'forks only' },
  { value: 'false', label: 'no forks' },
];
const LIFECYCLE: Option[] = [
  { value: 'none', label: 'none set' },
  { value: 'deprecated', label: 'deprecated' },
  { value: 'archived', label: 'archived' },
];
const DECISION: Option[] = [
  { value: 'keep', label: 'keep' },
  { value: 'none', label: 'none' },
];

export interface FilterBarProps {
  filters: ListFilters;
  /** The teams the current listing knows, for the team filter's options. */
  teams: string[];
  /** The finding kinds the current listing knows. */
  findingKinds: string[];
  onChange: (
    name: keyof ListFilters,
    value: string | number | boolean | undefined,
  ) => void;
}

function Choice({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: keyof ListFilters;
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

/** The filters of `list_repositories`, one control each; the URL keeps them. */
export function FilterBar({
  filters,
  teams,
  findingKinds,
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
          placeholder="name or description"
          value={filters.search ?? ''}
          InputLabelProps={{ shrink: true }}
          onChange={event =>
            onChange('search', event.target.value || undefined)
          }
        />
      </Grid>
      <Choice
        label="Renovate"
        name="renovate"
        value={filters.renovate}
        options={RENOVATE}
        onChange={onChange}
      />
      <Choice
        label="Team"
        name="team"
        value={filters.team}
        options={[
          { value: 'none', label: 'no team' },
          ...teams.map(team => ({ value: team, label: team })),
        ]}
        onChange={onChange}
      />
      <Choice
        label="Visibility"
        name="visibility"
        value={filters.visibility}
        options={VISIBILITY}
        onChange={onChange}
      />
      <Choice
        label="Fork"
        name="fork"
        value={filters.fork === undefined ? undefined : String(filters.fork)}
        options={FORK}
        onChange={(name, value) =>
          onChange(name, value === undefined ? undefined : value === 'true')
        }
      />
      <Choice
        label="Lifecycle"
        name="lifecycle"
        value={filters.lifecycle}
        options={LIFECYCLE}
        onChange={onChange}
      />
      <Grid item xs={6} md={2}>
        <TextField
          fullWidth
          size="small"
          type="number"
          id="filter-inactiveDays"
          label="Inactive for (days)"
          value={filters.inactiveDays ?? ''}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: 0 }}
          onChange={event =>
            onChange(
              'inactiveDays',
              event.target.value === ''
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      </Grid>
      <Grid item xs={6} md={2}>
        <TextField
          fullWidth
          size="small"
          type="number"
          id="filter-minOrphanScore"
          label="Min. orphan score"
          value={filters.minOrphanScore ?? ''}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: 0, max: 100 }}
          onChange={event =>
            onChange(
              'minOrphanScore',
              event.target.value === ''
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      </Grid>
      <Choice
        label="Decision"
        name="decision"
        value={filters.decision}
        options={DECISION}
        onChange={onChange}
      />
      <Choice
        label="Finding"
        name="finding"
        value={filters.finding}
        options={findingKinds.map(kind => ({ value: kind, label: kind }))}
        onChange={onChange}
      />
    </Grid>
  );
}

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Content, Progress } from '@backstage/core-components';
import { RoadmapField, RoadmapItemFilters } from '../../apis';
import { useSchema } from '../../hooks';
import { BoardView } from '../BoardView';
import { TeamActivityView } from '../TeamActivityView';
import { RoadmapErrorAlert } from '../RoadmapErrorAlert';

const useStyles = makeStyles((theme: Theme) => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    paddingBottom: theme.spacing(1),
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
    marginLeft: 'auto',
  },
  filter: {
    minWidth: 150,
  },
  viewBody: {
    paddingTop: theme.spacing(1),
  },
}));

const ALL = '';

/**
 * Hive's "all teams" scope (`?team=all`), and the old page's explicit
 * empty `?team=`, both mean no team filter.
 */
const ALL_TEAMS_PARAMS = new Set([ALL, 'all']);

/** The filter fields the toolbar offers, in display order. */
const FILTER_FIELDS: Array<{
  param: keyof RoadmapItemFilters;
  field: string;
}> = [
  { param: 'kind', field: 'Kind' },
  { param: 'quarter', field: 'Quarter' },
  { param: 'availability', field: 'Availability' },
];

function fieldValues(field: RoadmapField | undefined): string[] {
  return field?.options ?? field?.iterations ?? [];
}

/**
 * Roadmap board viewer: the status-column board and the per-assignee team
 * activity view over the GitHub Projects roadmap board, as Hive's Roadmap
 * tab. The team (`?team=`) and the search (`?q=`) come from Hive's header;
 * the view and the board's own filters travel as query params, so any view
 * is shareable.
 */
export function RoadmapPage() {
  const classes = useStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: schema, isLoading, error } = useSchema();

  const tab = searchParams.get('view') === 'activity' ? 'activity' : 'board';

  // The configured default team scopes the initial view; an explicit
  // `team=` (Hive's header writes it) wins, "all" meaning every team.
  const defaultTeam = schema?.defaultTeams[0] ?? ALL;
  const filters: RoadmapItemFilters = useMemo(() => {
    const result: RoadmapItemFilters = {};
    const team = searchParams.get('team') ?? defaultTeam;
    if (!ALL_TEAMS_PARAMS.has(team)) {
      result.team = team;
    }
    for (const { param } of FILTER_FIELDS) {
      const value = searchParams.get(param);
      if (value) {
        result[param] = value;
      }
    }
    // `keyword` is the old page's search parameter; old links keep it.
    const keyword = searchParams.get('q') ?? searchParams.get('keyword');
    if (keyword) {
      result.keyword = keyword;
    }
    return result;
  }, [searchParams, defaultTeam]);

  const setParam = (key: string, value: string) =>
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev);
        if (value === ALL) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        return params;
      },
      { replace: true },
    );

  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  if (error) {
    return (
      <Content>
        <RoadmapErrorAlert error={error as Error} />
      </Content>
    );
  }

  const fields = schema?.fields ?? [];
  const fieldByName = new Map(fields.map(field => [field.name, field]));

  return (
    <Content>
      <Box className={classes.toolbar}>
        <Tabs
          value={tab}
          onChange={(_, value) => setParam('view', value)}
          indicatorColor="primary"
        >
          <Tab label="Board" value="board" />
          <Tab label="Team activity" value="activity" />
        </Tabs>
        <Box className={classes.filters}>
          {FILTER_FIELDS.map(({ param, field }) => {
            const values = fieldValues(fieldByName.get(field));
            if (values.length === 0) {
              return null;
            }
            return (
              <TextField
                key={param}
                className={classes.filter}
                select
                size="small"
                variant="outlined"
                label={field}
                value={filters[param] ?? ALL}
                onChange={event => setParam(param, event.target.value)}
              >
                <MenuItem value={ALL}>All {field.toLowerCase()}s</MenuItem>
                {values.map(value => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
            );
          })}
        </Box>
      </Box>
      <Box className={classes.viewBody}>
        {tab === 'board' ? (
          <BoardView filters={filters} schemaFields={fields} />
        ) : (
          <TeamActivityView filters={filters} />
        )}
      </Box>
    </Content>
  );
}

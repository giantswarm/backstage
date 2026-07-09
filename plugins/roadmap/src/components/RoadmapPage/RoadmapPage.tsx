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
import { Alert } from '@material-ui/lab';
import { RoadmapField, RoadmapItemFilters } from '../../apis';
import { useSchema } from '../../hooks';
import { BoardView } from '../BoardView';
import { TeamActivityView } from '../TeamActivityView';

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
  keyword: {
    minWidth: 200,
  },
  viewBody: {
    paddingTop: theme.spacing(1),
  },
}));

const ALL = '';

/** The filter fields the toolbar offers, in display order. */
const FILTER_FIELDS: Array<{
  param: keyof RoadmapItemFilters;
  field: string;
}> = [
  { param: 'team', field: 'Team' },
  { param: 'kind', field: 'Kind' },
  { param: 'quarter', field: 'Quarter' },
  { param: 'availability', field: 'Availability' },
];

function fieldValues(field: RoadmapField | undefined): string[] {
  return field?.options ?? field?.iterations ?? [];
}

/**
 * Roadmap board viewer: the status-column board and the per-assignee team
 * activity view over the GitHub Projects roadmap board. All filters travel
 * as query params so any view is shareable.
 */
export function RoadmapPage() {
  const classes = useStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: schema, isLoading, error } = useSchema();

  const tab = searchParams.get('view') === 'activity' ? 'activity' : 'board';

  // The configured default team scopes the initial view; an explicit
  // `team=` param (including the empty "all teams" value) wins.
  const defaultTeam = schema?.defaultTeams[0] ?? ALL;
  const filters: RoadmapItemFilters = useMemo(() => {
    const result: RoadmapItemFilters = {
      team: searchParams.has('team')
        ? (searchParams.get('team') ?? ALL)
        : defaultTeam,
    };
    for (const { param } of FILTER_FIELDS) {
      if (param === 'team') {
        continue;
      }
      const value = searchParams.get(param);
      if (value) {
        result[param] = value;
      }
    }
    const keyword = searchParams.get('keyword');
    if (keyword) {
      result.keyword = keyword;
    }
    if (!result.team) {
      delete result.team;
    }
    return result;
  }, [searchParams, defaultTeam]);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    // `team` keeps an explicit empty value so "All teams" can override the
    // configured default; the other filters just drop out of the URL.
    if (value === ALL && key !== 'team') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    setSearchParams(params, { replace: true });
  };

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
        <Alert severity="error">{(error as Error).message}</Alert>
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
          <TextField
            className={classes.keyword}
            size="small"
            variant="outlined"
            label="Search"
            defaultValue={filters.keyword ?? ''}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                setParam(
                  'keyword',
                  (event.target as HTMLInputElement).value.trim(),
                );
              }
            }}
            onBlur={event => setParam('keyword', event.target.value.trim())}
          />
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

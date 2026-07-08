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
import { useApi } from '@backstage/frontend-plugin-api';
import { alertApiRef, configApiRef } from '@backstage/core-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BoardItem, ItemFilters, roadmapApiRef } from '../../apis';
import {
  AVAILABILITY_FIELD,
  fieldOptions,
  KIND_FIELD,
  QUARTER_FIELD,
  STATUS_FIELD,
  TEAM_FIELD,
} from '../../lib/board';
import { BoardView } from './BoardView';
import { TeamView } from './TeamView';

const useStyles = makeStyles((theme: Theme) => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    paddingBottom: theme.spacing(2),
  },
  filter: {
    minWidth: 180,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginLeft: 'auto',
  },
}));

const ALL = 'all';

/**
 * Roadmap board viewer: a status-lifecycle board and a per-assignee team
 * activity view over the GitHub Projects roadmap board. Filters travel as
 * query params so views are shareable.
 */
export function RoadmapPage() {
  const classes = useStyles();
  const roadmapApi = useApi(roadmapApiRef);
  const alertApi = useApi(alertApiRef);
  const configApi = useApi(configApiRef);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const configuredTeams =
    configApi.getOptionalStringArray('roadmap.teams') ?? [];

  const tab = searchParams.get('view') === 'team' ? 'team' : 'board';
  const team = searchParams.get('team') ?? configuredTeams[0] ?? ALL;
  const kind = searchParams.get('kind') ?? ALL;
  const availability = searchParams.get('availability') ?? ALL;
  const quarter = searchParams.get('quarter') ?? ALL;

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    setSearchParams(params, { replace: true });
  };

  const schemaQuery = useQuery({
    queryKey: ['roadmap', 'schema'],
    queryFn: () => roadmapApi.getSchema(),
  });

  const filters: ItemFilters = {
    team: team === ALL ? undefined : team,
    kind: kind === ALL ? undefined : kind,
    availability: availability === ALL ? undefined : availability,
    quarter: quarter === ALL ? undefined : quarter,
  };

  const itemsQuery = useQuery({
    queryKey: ['roadmap', 'items', filters],
    queryFn: () => roadmapApi.listItems(filters),
  });

  const statusMutation = useMutation({
    mutationFn: ({ item, status }: { item: BoardItem; status: string }) =>
      roadmapApi.updateItemField(item.id, STATUS_FIELD, status),
    onSuccess: (_, { item, status }) => {
      alertApi.post({
        message: `Moved '${item.title}' to ${status}`,
        severity: 'success',
        display: 'transient',
      });
      queryClient.invalidateQueries({ queryKey: ['roadmap'] });
    },
    onError: mutationError => {
      alertApi.post({
        message: `Failed to update status: ${(mutationError as Error).message}`,
        severity: 'error',
      });
    },
  });

  if (schemaQuery.isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  if (schemaQuery.error) {
    return (
      <Content>
        <Alert severity="error">{(schemaQuery.error as Error).message}</Alert>
      </Content>
    );
  }

  const fields = schemaQuery.data?.fields;
  const statusOptions = fieldOptions(fields, STATUS_FIELD);
  const teamOptions =
    configuredTeams.length > 0
      ? configuredTeams
      : fieldOptions(fields, TEAM_FIELD);
  const kindOptions = fieldOptions(fields, KIND_FIELD);
  const availabilityOptions = fieldOptions(fields, AVAILABILITY_FIELD);
  const quarterOptions = fieldOptions(fields, QUARTER_FIELD);

  const onStatusChange = (item: BoardItem, status: string) =>
    statusMutation.mutate({ item, status });

  const filterSelect = (
    label: string,
    value: string,
    options: string[],
    param: string,
  ) => (
    <TextField
      className={classes.filter}
      select
      size="small"
      variant="outlined"
      label={label}
      value={value}
      onChange={event => setParam(param, event.target.value)}
    >
      <MenuItem value={ALL}>All</MenuItem>
      {options.map(option => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Content>
      <Box className={classes.toolbar}>
        <Tabs
          value={tab}
          onChange={(_, value) => setParam('view', value)}
          indicatorColor="primary"
        >
          <Tab label="Board" value="board" />
          <Tab label="Team activity" value="team" />
        </Tabs>
        <Box className={classes.filters}>
          {filterSelect('Team', team, teamOptions, 'team')}
          {filterSelect('Kind', kind, kindOptions, 'kind')}
          {filterSelect(
            'Availability',
            availability,
            availabilityOptions,
            'availability',
          )}
          {filterSelect('Quarter', quarter, quarterOptions, 'quarter')}
        </Box>
      </Box>
      {itemsQuery.isLoading && <Progress />}
      {itemsQuery.error && (
        <Alert severity="error">{(itemsQuery.error as Error).message}</Alert>
      )}
      {itemsQuery.data &&
        (tab === 'board' ? (
          <BoardView
            items={itemsQuery.data.items}
            statusOptions={statusOptions}
            onStatusChange={onStatusChange}
          />
        ) : (
          <TeamView
            items={itemsQuery.data.items}
            statusOptions={statusOptions}
            onStatusChange={onStatusChange}
          />
        ))}
    </Content>
  );
}

import { Key, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, Progress } from '@backstage/core-components';
import { Flex, Select, Tab, TabList, Tabs } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { RoadmapField, RoadmapItemFilters } from '../../apis';
import { useSchema } from '../../hooks';
import { BoardView } from '../BoardView';
import { TeamActivityView } from '../TeamActivityView';
import { RoadmapErrorAlert } from '../RoadmapErrorAlert';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-4)',
    marginBottom: 'var(--bui-space-4)',
  },
  filters: {
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  filter: {
    minWidth: 170,
  },
});

const ALL = '';

/** The "Any kind" option's key: a select option needs a non-empty one. */
const ANY = 'any';

/**
 * Hive's "all teams" scope (`?team=all`), and the old page's explicit
 * empty `?team=`, both mean no team filter.
 */
const ALL_TEAMS_PARAMS = new Set([ALL, 'all']);

/** The filter fields the toolbar offers, in display order. */
const FILTER_FIELDS: Array<{
  param: 'kind' | 'quarter' | 'availability';
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
  const { data: schema, isPending, error } = useSchema();

  const view = searchParams.get('view') === 'activity' ? 'activity' : 'board';

  // The configured default team scopes the initial view; an explicit
  // `team=` (Hive's header writes it) wins, "all" meaning every team.
  const defaultTeam = schema?.defaultTeams[0] ?? ALL;
  const filters: RoadmapItemFilters = useMemo(() => {
    const teamParam = searchParams.get('team');
    const result: RoadmapItemFilters = {};
    const team = teamParam === null ? defaultTeam : teamParam;
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

  // Pending, not loading: a retry that waits while the tab is in the
  // background is pending without fetching, and has no data yet.
  if (isPending) {
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
      <div className={classes.toolbar}>
        <Tabs
          selectedKey={view}
          onSelectionChange={(key: Key) =>
            setParam('view', key === 'activity' ? 'activity' : ALL)
          }
        >
          <TabList aria-label="Roadmap views">
            <Tab id="board">Board</Tab>
            <Tab id="activity">Team activity</Tab>
          </TabList>
        </Tabs>
        <Flex className={classes.filters} gap="3" align="end">
          {FILTER_FIELDS.map(({ param, field }) => {
            const values = fieldValues(fieldByName.get(field));
            if (values.length === 0) {
              return null;
            }
            return (
              <div key={param} className={classes.filter}>
                <Select
                  label={field}
                  size="small"
                  options={[
                    { id: ANY, label: `Any ${field.toLowerCase()}` },
                    ...values.map(value => ({ id: value, label: value })),
                  ]}
                  selectedKey={filters[param] ?? ANY}
                  onSelectionChange={key =>
                    setParam(param, key === ANY ? ALL : String(key ?? ALL))
                  }
                />
              </div>
            );
          })}
        </Flex>
      </div>
      {view === 'board' ? (
        <BoardView filters={filters} schemaFields={fields} />
      ) : (
        <TeamActivityView filters={filters} schemaFields={fields} />
      )}
    </Content>
  );
}

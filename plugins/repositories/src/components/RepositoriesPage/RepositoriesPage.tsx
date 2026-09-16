import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, Progress } from '@backstage/core-components';
import { Box, Tab, Tabs, Typography } from '@material-ui/core';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { ListFilters, repositoriesApiRef, Scope } from '../../apis';
import { filtersFromParams, hasFilters, withFilter } from '../../lib/filters';
import { defaultScope } from '../../lib/scope';
import { FilterBar } from '../FilterBar';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';
import { RepositoriesTable } from '../RepositoriesTable';
import { Tiles } from '../Tiles';

/** The whole org fits; the manager's default of 100 rows would not. */
const LIST_LIMIT = 2000;

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'mine', label: 'My team' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'all', label: 'All repositories' },
];

/**
 * The Repositories page: the org's inventory from giantswarm-repo-manager,
 * read as the signed-in person. Scopes (mine, unassigned, all), tiles over
 * the listed rows, the manager's filters, the sortable table with a row's
 * full record on expansion. Nothing is composed here: every value is what
 * `list_repositories` and `get_repository` return.
 */
export function RepositoriesPage() {
  const api = useApi(repositoriesApiRef);
  const [searchParams, setSearchParams] = useSearchParams();

  // Who the caller is decides the scope the page opens on; the tabs and
  // filters then live in the URL.
  const info = useQuery({
    queryKey: ['repositories', 'info'],
    queryFn: () => api.getInfo(),
  });

  const urlFilters = useMemo(
    () => filtersFromParams(searchParams),
    [searchParams],
  );
  const scope: Scope = urlFilters.scope ?? defaultScope(info.data);
  const filters: ListFilters = useMemo(
    () => ({ ...urlFilters, scope, limit: LIST_LIMIT }),
    [urlFilters, scope],
  );

  const setFilter = useCallback(
    (name: keyof ListFilters, value: string | number | boolean | undefined) =>
      setSearchParams(prev => withFilter(prev, name, value), { replace: true }),
    [setSearchParams],
  );

  const listing = useQuery({
    queryKey: ['repositories', 'list', filters],
    queryFn: () => api.listRepositories(filters),
    enabled: !info.isLoading,
  });

  const rows = useMemo(() => listing.data?.repositories ?? [], [listing.data]);
  const teams = useMemo(
    () =>
      [
        ...new Set(rows.map(row => row.team).filter((t): t is string => !!t)),
      ].sort(),
    [rows],
  );
  const findingKinds = useMemo(
    () => [...new Set(rows.flatMap(row => row.findings ?? []))].sort(),
    [rows],
  );

  if (info.isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  const error = (info.error ?? listing.error) as Error | null;

  return (
    <Content>
      <Tabs
        value={scope}
        onChange={(_event, next: Scope) => setFilter('scope', next)}
        aria-label="Scope"
      >
        {SCOPES.map(tab => (
          <Tab key={tab.id} value={tab.id} label={tab.label} />
        ))}
      </Tabs>

      {error && (
        <Box pt={2}>
          <RepositoriesErrorAlert
            title="Failed to read the inventory"
            error={error}
          />
        </Box>
      )}

      {!error && (
        <>
          <Box pt={2}>
            <Tiles rows={rows} />
          </Box>
          <Box pt={2}>
            <FilterBar
              filters={filters}
              teams={teams}
              findingKinds={findingKinds}
              onChange={setFilter}
            />
          </Box>
          <Box pt={2} pb={1}>
            <Typography
              variant="body2"
              color="textSecondary"
              data-testid="listing-summary"
            >
              {listing.isLoading
                ? 'Reading the inventory…'
                : `${listing.data?.shown ?? 0} of ${listing.data?.matched ?? 0} matching repositories` +
                  `${hasFilters(filters) ? ' (filtered)' : ''}, ${listing.data?.total ?? 0} in the inventory` +
                  `${listing.data?.sweep ? `; last sweep ${listing.data.sweep.finishedAt.slice(0, 16).replace('T', ' ')}Z` : ''}` +
                  `${listing.data?.sweepRunning ? ' (a sweep is running)' : ''}`}
            </Typography>
          </Box>
          {listing.isLoading ? <Progress /> : <RepositoriesTable rows={rows} />}
        </>
      )}
    </Content>
  );
}

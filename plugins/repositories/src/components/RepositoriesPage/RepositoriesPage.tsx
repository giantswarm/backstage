import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, LinkButton } from '@backstage/core-components';
import { Box, Tab, Tabs, Typography } from '@material-ui/core';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { FiltersLayout } from '@giantswarm/backstage-plugin-ui-react';
import { ListFilters, repositoriesApiRef, Scope } from '../../apis';
import {
  filtersFromParams,
  hasFilters,
  showsArchived,
  withFilter,
} from '../../lib/filters';
import { defaultScope } from '../../lib/scope';
import { createRepositoryRouteRef } from '../../routes';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';
import { RepositoriesFilters } from '../RepositoriesFilters';
import { RepositoriesTable } from '../RepositoriesTable';

/** The whole org fits; the manager's default of 100 rows would not. */
const LIST_LIMIT = 2000;

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'mine', label: 'My team' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'all', label: 'All repositories' },
];

/** The filters as `list_repositories` receives them: only the ones set. */
function compact(filters: ListFilters): ListFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  ) as ListFilters;
}

const distinct = (values: (string | undefined)[]) =>
  [...new Set(values.filter((value): value is string => !!value))].sort();

/**
 * The Repositories page: the org's inventory from giantswarm-repo-manager,
 * read as the signed-in person. Scopes (mine, unassigned, all) as tabs, the
 * manager's filters in the column the Clusters page uses, the sortable table
 * with a row's full record in its detail panel. Archived repositories are
 * hidden until asked for. Every value is what `list_repositories` and
 * `get_repository` return.
 */
export function RepositoriesPage() {
  const api = useApi(repositoriesApiRef);
  const createLink = useRouteRef(createRepositoryRouteRef);
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
  const showArchived = useMemo(
    () => showsArchived(searchParams),
    [searchParams],
  );
  const scope: Scope = urlFilters.scope ?? defaultScope(info.data);
  const filters: ListFilters = useMemo(
    () => compact({ ...urlFilters, scope, limit: LIST_LIMIT }),
    [urlFilters, scope],
  );
  // The scope's whole inventory, for the Team and Finding options: what a
  // filter narrowed the rows to must not narrow the choices too.
  const inventoryFilters: ListFilters = useMemo(
    () => ({ scope, limit: LIST_LIMIT }),
    [scope],
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
  const inventory = useQuery({
    queryKey: ['repositories', 'list', inventoryFilters],
    queryFn: () => api.listRepositories(inventoryFilters),
    enabled: !info.isLoading,
  });

  const rows = useMemo(() => listing.data?.repositories ?? [], [listing.data]);
  const teams = useMemo(
    () => distinct((inventory.data?.repositories ?? []).map(row => row.team)),
    [inventory.data],
  );
  const findingKinds = useMemo(
    () =>
      distinct(
        (inventory.data?.repositories ?? []).flatMap(row => row.findings ?? []),
      ),
    [inventory.data],
  );

  const error = (info.error ?? listing.error) as Error | null;
  const summary = listing.data
    ? `${listing.data.shown} of ${listing.data.matched} matching repositories` +
      `${hasFilters(filters) ? ' (filtered)' : ''}, ${listing.data.total} in the inventory` +
      `${showArchived ? '' : '; archived hidden'}` +
      `${listing.data.sweep ? `; last sweep ${listing.data.sweep.finishedAt.slice(0, 16).replace('T', ' ')}Z` : ''}` +
      `${listing.data.sweepRunning ? ' (a sweep is running)' : ''}` +
      `${listing.data.note ? `. ${listing.data.note}` : ''}`
    : 'Reading the inventory…';

  return (
    <Content>
      <Box display="flex" alignItems="center">
        <Box flexGrow={1}>
          <Tabs
            value={scope}
            onChange={(_event, next: Scope) => setFilter('scope', next)}
            aria-label="Scope"
          >
            {SCOPES.map(tab => (
              <Tab key={tab.id} value={tab.id} label={tab.label} />
            ))}
          </Tabs>
        </Box>
        <LinkButton
          to={createLink?.() ?? 'create'}
          color="primary"
          variant="contained"
          size="small"
        >
          Create repository
        </LinkButton>
      </Box>

      {error && (
        <Box pt={2}>
          <RepositoriesErrorAlert
            title="Failed to read the inventory"
            error={error}
          />
        </Box>
      )}

      {!error && (
        <Box pt={2}>
          <FiltersLayout>
            <FiltersLayout.Filters>
              <RepositoriesFilters
                scope={scope}
                filters={filters}
                showArchived={showArchived}
                teams={teams}
                findingKinds={findingKinds}
                onChange={setFilter}
              />
            </FiltersLayout.Filters>
            <FiltersLayout.Content>
              <Box pb={1} pl={{ lg: 2 }}>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  data-testid="listing-summary"
                >
                  {summary}
                </Typography>
              </Box>
              <Box pl={{ lg: 2 }}>
                <RepositoriesTable
                  rows={rows}
                  isLoading={info.isLoading || listing.isLoading}
                />
              </Box>
            </FiltersLayout.Content>
          </FiltersLayout>
        </Box>
      )}
    </Content>
  );
}

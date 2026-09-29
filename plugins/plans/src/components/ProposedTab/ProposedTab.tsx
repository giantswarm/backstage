import { useMemo } from 'react';
import { EmptyState } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { PlanPullRow, ProposedPlansTable } from '../ProposedPlansTable';
import { PlansErrorAlert } from '../PlansErrorAlert';

/**
 * Open pull requests against the plan repository -- plans proposed for team
 * review. Fetches the pull requests and the epics they reference, and hands
 * them to the table as rows.
 */
export function ProposedTab({ repo }: { repo: string }) {
  const plansApi = useApi(plansApiRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'pulls', repo],
    queryFn: () => plansApi.listPulls(repo),
  });

  // Epic references per open PR, for the cross-link chips. Failure just
  // means no chips.
  const { data: epicsData } = useQuery({
    queryKey: ['plans', 'epics', repo],
    queryFn: () => plansApi.listEpics(repo),
    retry: false,
  });

  const rows = useMemo<PlanPullRow[]>(() => {
    const epicByPull = new Map(
      (epicsData?.pulls ?? []).map(entry => [entry.number, entry.epic]),
    );
    return (data?.pulls ?? []).map(pull => ({
      ...pull,
      id: pull.number,
      epic: epicByPull.get(pull.number),
    }));
  }, [data, epicsData]);

  if (error) {
    return (
      <PlansErrorAlert
        title="Failed to load proposed plans"
        error={error as Error}
      />
    );
  }

  // Only once the pull requests have settled: while they load the table shows
  // its own skeleton, and an empty-state saying there are no plans would
  // otherwise flash in front of it.
  if (!isLoading && rows.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No proposed plans"
        description={`There are no open pull requests in ${repo}.`}
      />
    );
  }

  // Keyed by repository, so switching repositories builds a new table rather
  // than reusing this one. bui's `useTable` holds the last non-empty rows in a
  // ref and falls back to them whenever `data` is undefined -- and with the
  // `data` (rather than `getData`) form it never puts itself back into its
  // pending state -- so without this the previous repository's plans stay on
  // screen, at full opacity, while their links already carry the new
  // repository: a click would open the wrong plan, or none.
  return (
    <ProposedPlansTable
      key={repo}
      rows={rows}
      repo={repo}
      isLoading={isLoading}
    />
  );
}

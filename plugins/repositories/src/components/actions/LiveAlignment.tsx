import { useState } from 'react';
import { Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { InventoryRecord, repositoriesApiRef } from '../../apis';
import { alignmentPhases, phasesSettled } from '../../lib/phases';
import { PhaseList } from '../PhaseList';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';

/** The record is re-read this often while the run has not reported. */
const RUN_POLL_MS = 5_000;

/**
 * An Align now followed to its report: the dispatch, then the reconciler
 * run's report -- the record's pending run (the manager marks it at the
 * dispatch) turning into its last run once the inventory has read the run's
 * artifact, with the run's verdict; a run that does not report within the
 * manager's pending window is the record's missing run, shown as the
 * failure it is. The record is the row's own query, so the row updates
 * with it.
 */
export function LiveAlignment({ repository }: { repository: string }) {
  const api = useApi(repositoriesApiRef);
  // The dispatch answered when this mounted: a run counts from here.
  const [since] = useState(() => new Date().toISOString());
  const record = useQuery<InventoryRecord, Error>({
    queryKey: ['repositories', 'record', repository],
    queryFn: () => api.getRepository(repository),
    refetchInterval: query =>
      phasesSettled(alignmentPhases(query.state.data, since))
        ? false
        : RUN_POLL_MS,
    refetchIntervalInBackground: true,
  });
  return (
    <Flex direction="column" gap="2" data-testid="live-alignment">
      <Text variant="body-small" color="secondary">
        The run, as the record shows it:
      </Text>
      <PhaseList
        phases={alignmentPhases(record.data, since)}
        data-testid="alignment-phases"
      />
      {record.error && (
        <RepositoriesErrorAlert
          title={`Failed to read ${repository}`}
          error={record.error}
        />
      )}
    </Flex>
  );
}

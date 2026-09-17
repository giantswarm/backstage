import { Typography } from '@material-ui/core';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { repositoriesApiRef } from '../../apis';
import { RepositoryDetails } from '../RepositoryDetails';

/** The record of a repository just created is looked for this often. */
const WAIT_POLL_MS = 15_000;

/**
 * The set-up of a repository just created, live: the repository and its
 * scaffold exist, but until the pull request merges and the reconciler has
 * run, the manager knows no record (404) and this waits, re-asking every
 * 15 s; from then on the record with its steps converging, its links and its
 * completion state (repository, catalog entity, first release) -- the same
 * view the row shows.
 */
export function LiveSetup({ repository }: { repository: string }) {
  const api = useApi(repositoriesApiRef);
  const probe = useQuery({
    queryKey: ['repositories', 'record', repository],
    queryFn: () => api.getRepository(repository),
    retry: false,
    refetchInterval: query =>
      query.state.error && (query.state.error as Error).name === 'NotFoundError'
        ? WAIT_POLL_MS
        : false,
  });

  if (probe.error && (probe.error as Error).name === 'NotFoundError') {
    return (
      <Typography
        variant="body2"
        color="textSecondary"
        data-testid="setup-waiting"
      >
        Waiting for the pull request to merge: the reconciler sets
        {` ${repository} `}up after that (the repository and its scaffold exist
        already); the steps appear here as they run.
      </Typography>
    );
  }
  return <RepositoryDetails repository={repository} />;
}

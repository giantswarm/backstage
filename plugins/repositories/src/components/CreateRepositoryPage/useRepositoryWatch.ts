import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { repositoriesApiRef, Watch } from '../../apis';

/**
 * How long one `watch_repository` call may block. The manager allows up to
 * 150 s; the page stays well under the 30 s at which the agent runtime cuts
 * a tool call off, so the same bound holds wherever the manager is called
 * from, and a person sees a phase within seconds of it completing anyway:
 * the call returns as soon as one does.
 */
export const WATCH_TIMEOUT_S = 20;

/** The next call follows the last answer at once; a failed call waits a little. */
const WATCH_AGAIN_MS = 1_000;
const WATCH_RETRY_MS = 10_000;

/**
 * Follows a repository just created to readiness: `watch_repository` with
 * the pull request `create_repository` opened, called again as soon as it
 * answers while the repository is neither ready nor failed -- in a tab that
 * is not focused too. The last answer is the state: the manager reports
 * every phase reached from the start on each call. A call that fails keeps
 * the last answer on screen and is tried again.
 */
export function useRepositoryWatch({
  repository,
  pullRequest,
}: {
  repository?: string;
  pullRequest?: number;
}) {
  const api = useApi(repositoriesApiRef);
  return useQuery<Watch, Error>({
    queryKey: ['repositories', 'watch', repository, pullRequest],
    queryFn: () =>
      api.watchRepository(repository!, {
        pullRequest: pullRequest!,
        timeout: WATCH_TIMEOUT_S,
      }),
    enabled: repository !== undefined && pullRequest !== undefined,
    staleTime: 0,
    refetchIntervalInBackground: true,
    refetchInterval: query => {
      const watch = query.state.data;
      if (watch && (watch.ready || watch.failure)) {
        return false;
      }
      return query.state.error ? WATCH_RETRY_MS : WATCH_AGAIN_MS;
    },
  });
}

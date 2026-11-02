import { QueryClient } from '@tanstack/react-query';
import { invalidateWorkflowRuns, workflowRunKeys } from './workflowRunKeys';

describe('invalidateWorkflowRuns', () => {
  it('marks stale the runs of the named workflows and the installation’s newest runs, nothing else', () => {
    const queryClient = new QueryClient();
    const keys = {
      deployLatest: workflowRunKeys.latest('gazelle', 'deploy'),
      deployCount: workflowRunKeys.count('gazelle', 'deploy', 'failed'),
      deployStats: workflowRunKeys.stats('gazelle', 'deploy'),
      notifyLatest: workflowRunKeys.latest('gazelle', 'notify'),
      lastRuns: workflowRunKeys.lastRuns('gazelle'),
      otherLatest: workflowRunKeys.latest('gazelle', 'audit'),
      otherInstallation: workflowRunKeys.latest('golem', 'deploy'),
    };
    for (const key of Object.values(keys)) {
      queryClient.setQueryData(key, {});
    }

    invalidateWorkflowRuns(queryClient, 'gazelle', ['deploy', 'notify']);

    const stale = Object.fromEntries(
      Object.entries(keys).map(([label, key]) => [
        label,
        queryClient.getQueryState(key)?.isInvalidated,
      ]),
    );
    expect(stale).toEqual({
      deployLatest: true,
      deployCount: true,
      deployStats: true,
      notifyLatest: true,
      lastRuns: true,
      otherLatest: false,
      otherInstallation: false,
    });
  });
});

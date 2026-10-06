import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type { ClusterWriteResult } from '../../lib/clusterManager';
import { DeleteClusterDialog } from './DeleteClusterDialog';

const DRY_RUN: ClusterWriteResult = {
  cluster: 'demo1',
  namespace: 'org-acme',
  pool: '',
  mode: 'apply',
  dryRun: true,
  objects: [
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      name: 'demo1',
      namespace: 'org-acme',
      action: 'would-delete',
    },
  ],
  withCluster: ['demo1-gpu00', 'demo1-gpu-operator', 'demo1-agent-platform'],
  models: ['qwen3-4b'],
};

const NEXT_STEP =
  'the Cluster demo1 is being removed: call delete_cluster again with the same arguments once list_clusters no longer lists it';

const COMMIT = {
  repository: 'acme/fleet',
  base: 'main',
  directory: 'management-clusters/inst-1/organizations/acme/workload-clusters',
  kustomization: 'flux-giantswarm/inst-1-gitops',
  prune: false,
  branch: 'cluster-manager/delete-demo1',
  files: [{ path: 'demo1.yaml', action: 'delete' }],
  liveSteps: [
    'after the merge: delete_cluster in mode apply deletes the Kustomization inst-1-clusters-demo1, and Flux removes the cluster',
  ],
};

const IN_GIT =
  'HelmRelease org-acme/demo1 is in Flux Kustomization flux-giantswarm/inst-1-clusters-demo1’s inventory: remove it from git, a live delete would be undone';

type Scenario = {
  /** delete_cluster in mode apply refuses: git owns the cluster. */
  inGit?: boolean;
  /** Both modes refuse: the installation's own cluster. */
  ownCluster?: boolean;
};

function makeMusterApi(scenario: Scenario = {}) {
  let applies = 0;
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      if (name !== 'x_cluster-manager_delete_cluster') {
        throw new Error(`unexpected tool ${name}`);
      }
      if (scenario.ownCluster) {
        throw new Error(
          'demo1 is the installation’s own cluster: delete_cluster never removes it',
        );
      }
      if (args.mode === 'commit') {
        return {
          ...DRY_RUN,
          mode: 'commit',
          dryRun: Boolean(args.dryRun),
          commit: args.dryRun
            ? COMMIT
            : {
                ...COMMIT,
                pullRequest: 'https://github.com/acme/fleet/pull/9',
                number: 9,
              },
        };
      }
      if (scenario.inGit && args.dryRun) {
        throw new Error(IN_GIT);
      }
      if (args.dryRun) {
        return DRY_RUN;
      }
      applies += 1;
      return {
        ...DRY_RUN,
        dryRun: false,
        objects: DRY_RUN.objects.map(o => ({ ...o, action: 'deleted' })),
        ...(applies === 1 ? { nextStep: NEXT_STEP } : {}),
      };
    },
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

async function renderDialog(scenario: Scenario = {}, commitOffered = true) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <DeleteClusterDialog
          isOpen
          onOpenChange={() => {}}
          installation="inst-1"
          organization="acme"
          name="demo1"
          commitOffered={commitOffered}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

const writesOf = (callTool: jest.Mock) =>
  callTool.mock.calls.filter(
    call => !(call[1] as Record<string, unknown>).dryRun,
  );

describe('DeleteClusterDialog', () => {
  it('shows what goes with the cluster and asks for its name', async () => {
    const user = userEvent.setup();
    await renderDialog({}, false);

    expect(
      await screen.findByText(
        'Goes with the cluster: demo1-gpu00, demo1-gpu-operator, demo1-agent-platform.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Served on it, and gone with it: qwen3-4b.'),
    ).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Delete cluster' });
    expect(remove).toBeDisabled();
    await user.type(screen.getByLabelText(/Type demo1 to confirm/), 'demo1');
    expect(remove).toBeEnabled();
  });

  it('deletes as the person and offers the second call cluster-manager names', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({}, false);
    await screen.findByTestId('what-goes');
    await user.type(screen.getByLabelText(/Type demo1 to confirm/), 'demo1');
    await user.click(screen.getByRole('button', { name: 'Delete cluster' }));

    expect(await screen.findByText(NEXT_STEP)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish removal' }));
    await waitFor(() => expect(writesOf(callTool)).toHaveLength(2));
    expect(writesOf(callTool)[1][1]).toEqual({
      organization: 'acme',
      name: 'demo1',
      mode: 'apply',
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Finish removal' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('commits the removal where git owns the cluster, then runs the live step after the merge', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({ inGit: true });
    await screen.findByTestId('what-goes');

    expect(screen.getByRole('radio', { name: /^Commit/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Delete/ })).toBeDisabled();
    expect(
      screen.getByText(`Delete is not possible: ${IN_GIT}`),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Type demo1 to confirm/), 'demo1');
    await user.click(screen.getByRole('button', { name: 'Commit removal' }));
    expect(
      await screen.findByText('Pull request #9 opened'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('live-steps')).toHaveTextContent(
      'delete_cluster in mode apply deletes the Kustomization',
    );

    await user.click(
      screen.getByRole('button', { name: 'Merged: run the live step' }),
    );
    await waitFor(() =>
      expect(writesOf(callTool).map(call => call[1].mode)).toEqual([
        'commit',
        'apply',
      ]),
    );
  });

  it('shows the refusal with its reason and checks again', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({ ownCluster: true });

    const refused = await screen.findByTestId('delete-refused');
    expect(refused).toHaveTextContent(
      'demo1 is the installation’s own cluster: delete_cluster never removes it',
    );
    expect(
      screen.getByRole('button', { name: 'Delete cluster' }),
    ).toBeDisabled();
    const before = callTool.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() =>
      expect(callTool.mock.calls.length).toBeGreaterThan(before),
    );
  });
});

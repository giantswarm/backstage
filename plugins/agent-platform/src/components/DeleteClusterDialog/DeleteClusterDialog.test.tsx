import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type { ClusterWriteResult } from '../../lib/clusterManager';
import { DeleteClusterDialog } from './DeleteClusterDialog';
import { REMOVAL_CHECK_INTERVAL_MS } from './removalPasses';

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

const UNINSTALL_STEP =
  'helm-controller uninstalls the cluster — a small one is gone in about five minutes, list_clusters lists it until then —; re-run delete_cluster with the same arguments afterwards: it removes what the uninstall left in org-acme (a default app whose install was still running)';

const BEING_REMOVED =
  "cluster org-acme/demo1 is being removed since 2026-11-03T10:00:00Z: helm-controller's uninstall is still running — re-run delete_cluster with the same arguments once list_clusters no longer lists it";

const ORPHANS_STEP =
  're-run delete_cluster with the same arguments once helm-controller has removed the suspended releases: it answers that nothing of the cluster is left';

const ORPHAN_WARNING =
  '1 HelmRelease(s) installing into the gone cluster through demo1-kubeconfig were suspended and deleted, and helm-controller has not taken finalizers.fluxcd.io off them yet: org-acme/demo1-llm-d';

function object(kind: string, name: string, action: string) {
  return {
    apiVersion: kind === 'ConfigMap' ? 'v1' : 'helm.toolkit.fluxcd.io/v2',
    kind,
    name,
    namespace: 'org-acme',
    action,
  };
}

/** A real call's answer. */
function pass(
  objects: ClusterWriteResult['objects'],
  extra: Partial<ClusterWriteResult> = {},
): ClusterWriteResult {
  return { ...DRY_RUN, dryRun: false, objects, ...extra };
}

/** A dry run of the next pass, as the dialog checks it. */
function dryRun(
  objects: ClusterWriteResult['objects'],
  extra: Partial<ClusterWriteResult> = {},
): ClusterWriteResult {
  return { ...DRY_RUN, objects, withCluster: [], models: [], ...extra };
}

/** Delete: the release, its source and its values go; the uninstall starts. */
const FIRST_PASS = pass(
  [
    object('HelmRelease', 'demo1', 'deleted'),
    object('OCIRepository', 'demo1', 'deleted'),
    object('ConfigMap', 'demo1-cluster-values', 'deleted'),
  ],
  { nextStep: UNINSTALL_STEP },
);

/** The release is still uninstalling: a pass would delete it again. */
const STILL_UNINSTALLING = dryRun(
  [object('HelmRelease', 'demo1', 'would-delete')],
  { nextStep: UNINSTALL_STEP },
);

/** The release is gone, the Cluster still going: a pass writes nothing. */
const CLUSTER_GOING = dryRun([], { nextStep: BEING_REMOVED });

/** The Cluster is gone: what the uninstall left. */
const LEFTOVERS = dryRun([
  object('HelmRelease', 'demo1-observability', 'would-delete'),
  object('HelmRelease', 'demo1-llm-d', 'would-delete'),
]);

const LEFTOVERS_REMOVED = pass([
  object('HelmRelease', 'demo1-observability', 'deleted'),
  object('HelmRelease', 'demo1-llm-d', 'deleted'),
]);

/** The leftovers deleted, one held by helm-controller's finalizer. */
const ORPHAN_LEFT = pass(
  [
    object('HelmRelease', 'demo1-observability', 'deleted'),
    object('HelmRelease', 'demo1-llm-d', 'deleted'),
  ],
  { warnings: [ORPHAN_WARNING], nextStep: ORPHANS_STEP },
);

/** The suspended release still terminating: a pass would delete it again. */
const ORPHAN_GOING = dryRun(
  [object('HelmRelease', 'demo1-llm-d', 'would-delete')],
  {
    warnings: [
      '1 HelmRelease(s) install into the cluster through demo1-kubeconfig, which is gone: they would be suspended and deleted, so helm-controller skips their uninstall and takes finalizers.fluxcd.io off: org-acme/demo1-llm-d',
    ],
  },
);

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

/** delete_cluster's answer once nothing of the cluster is left, as the muster client throws it. */
function nothingLeftError() {
  return Object.assign(
    new Error('cluster org-acme/demo1 (nothing of it is left) not found'),
    {
      details: [
        JSON.stringify({
          notFound: {
            cluster: 'demo1',
            namespace: 'org-acme',
            nothingLeft: true,
          },
        }),
      ],
    },
  );
}

/** One answer of cluster-manager: a result, or an error it throws. */
type Answer = ClusterWriteResult | (() => Error);

type Scenario = {
  /** delete_cluster in mode apply refuses: git owns the cluster. */
  inGit?: boolean;
  /** Both modes refuse: the installation's own cluster. */
  ownCluster?: boolean;
  /** Nothing of the cluster is left from the start. */
  gone?: boolean;
  /** The answers to the calls in mode apply, in order; the last repeats. */
  passes?: Answer[];
  /** The answers to the dry runs after a pass, in order; the last repeats. */
  checks?: Answer[];
};

function answer(answers: Answer[], index: number): ClusterWriteResult {
  const next = answers[Math.min(index, answers.length - 1)];
  if (typeof next === 'function') {
    throw next();
  }
  return next;
}

function makeMusterApi(scenario: Scenario = {}) {
  const passes = scenario.passes ?? [FIRST_PASS];
  const checks = scenario.checks ?? [STILL_UNINSTALLING];
  let applies = 0;
  let dryRuns = 0;
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      if (name !== 'x_cluster-manager_delete_cluster') {
        throw new Error(`unexpected tool ${name}`);
      }
      if (scenario.gone) {
        throw nothingLeftError();
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
      if (args.dryRun) {
        dryRuns += 1;
        // The dialog's opening dry run, then its checks after each pass.
        if (dryRuns === 1) {
          if (scenario.inGit) {
            throw new Error(IN_GIT);
          }
          return DRY_RUN;
        }
        return answer(checks, dryRuns - 2);
      }
      applies += 1;
      return answer(passes, applies - 1);
    },
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

async function renderDialog(
  scenario: Scenario = {},
  commitOffered = true,
  onOpenChange: (isOpen: boolean) => void = () => {},
  musterApi = makeMusterApi(scenario),
) {
  const { api, callTool } = musterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <DeleteClusterDialog
          isOpen
          onOpenChange={onOpenChange}
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

/** Types the name and presses Delete cluster, once the dry runs answered. */
async function deleteCluster(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('what-goes');
  await user.type(screen.getByLabelText(/Type demo1 to confirm/), 'demo1');
  await user.click(screen.getByRole('button', { name: 'Delete cluster' }));
}

const writesOf = (callTool: jest.Mock) =>
  callTool.mock.calls.filter(
    call => !(call[1] as Record<string, unknown>).dryRun,
  );

describe('DeleteClusterDialog', () => {
  it('shows what goes with the cluster and asks for its name', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({}, false);

    expect(
      await screen.findByText(
        'Goes with the cluster: demo1-gpu00, demo1-gpu-operator, demo1-agent-platform.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Served on it, and gone with it: qwen3-4b.'),
    ).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Delete cluster' });
    // Pressable before the name is typed: the field says what is missing.
    await user.click(remove);
    const field = screen.getByLabelText(/Type demo1 to confirm/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining('Type demo1 to confirm the deletion.'),
    );
    expect(field).toHaveFocus();
    expect(writesOf(callTool)).toHaveLength(0);

    // Pasted with a trailing space, as copied from a table.
    await user.type(field, 'demo1 ');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('deletes as the person, then waits for the uninstall instead of offering a pass that would change nothing', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({}, false);
    await deleteCluster(user);

    const first = await screen.findByTestId('delete-pass');
    expect(first).toHaveTextContent('Removed as you: 3 objects');
    expect(first).toHaveTextContent(
      'HelmRelease org-acme/demo1 · OCIRepository org-acme/demo1 · ConfigMap org-acme/demo1-cluster-values',
    );
    expect(first).toHaveTextContent(UNINSTALL_STEP);
    // The check's dry run would only delete the release again: no button,
    // and the next step it repeats is not said twice.
    expect(await screen.findByText(/^Checked at /)).toBeInTheDocument();
    expect(screen.getAllByText(UNINSTALL_STEP)).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Finish removal' }),
    ).not.toBeInTheDocument();
    expect(writesOf(callTool)).toHaveLength(1);
  });

  it('offers Finish removal once a check finds something new to remove', async () => {
    jest.useFakeTimers();
    try {
      // No delays between keystrokes: the fake clock moves only when told.
      const user = userEvent.setup({ delay: null });
      await renderDialog({ checks: [CLUSTER_GOING, LEFTOVERS] }, false);
      await deleteCluster(user);

      // The release is gone and the Cluster still going: what it waits for.
      expect(await screen.findByText(BEING_REMOVED)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Finish removal' }),
      ).not.toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(REMOVAL_CHECK_INTERVAL_MS);
      });
      expect(
        await screen.findByRole('button', { name: 'Finish removal' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('removal-next')).toHaveTextContent(
        '2 objects are left to remove now: HelmRelease org-acme/demo1-observability, HelmRelease org-acme/demo1-llm-d.',
      );
      expect(screen.queryByText(BEING_REMOVED)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows a second pass that finishes the removal', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog(
      {
        passes: [FIRST_PASS, LEFTOVERS_REMOVED],
        checks: [LEFTOVERS, nothingLeftError],
      },
      false,
    );
    await deleteCluster(user);
    await user.click(
      await screen.findByRole('button', { name: 'Finish removal' }),
    );

    expect(await screen.findByTestId('delete-complete')).toHaveTextContent(
      'demo1 is removed: nothing of it is left',
    );
    const [, second] = screen.getAllByTestId('delete-pass');
    expect(second).toHaveTextContent('Removed as you: 2 objects');
    expect(second).toHaveTextContent('Finish removal, ');
    expect(second).toHaveTextContent(
      'HelmRelease org-acme/demo1-observability · HelmRelease org-acme/demo1-llm-d',
    );
    // The first pass's next step no longer holds.
    expect(screen.queryByText(UNINSTALL_STEP)).toBeNull();
    expect(screen.queryByText('cluster-manager refused')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Finish removal' }),
    ).not.toBeInTheDocument();
    expect(writesOf(callTool)).toHaveLength(2);
    expect(writesOf(callTool)[1][1]).toEqual({
      organization: 'acme',
      name: 'demo1',
      mode: 'apply',
    });
  });

  it('shows a second pass that removes more but not all, and what it waits for', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog(
      { passes: [FIRST_PASS, ORPHAN_LEFT], checks: [LEFTOVERS, ORPHAN_GOING] },
      false,
    );
    await deleteCluster(user);
    await user.click(
      await screen.findByRole('button', { name: 'Finish removal' }),
    );

    await waitFor(() =>
      expect(screen.getAllByTestId('delete-pass')).toHaveLength(2),
    );
    const [, second] = screen.getAllByTestId('delete-pass');
    expect(second).toHaveTextContent('Removed as you: 2 objects');
    expect(second).toHaveTextContent(ORPHAN_WARNING);
    expect(second).toHaveTextContent(ORPHANS_STEP);
    // The check would only delete the terminating release again.
    expect(await screen.findByText(/^Checked at /)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Finish removal' }),
    ).not.toBeInTheDocument();
    expect(writesOf(callTool)).toHaveLength(2);
  });

  it('says so when a second pass changes nothing, and does not offer it again', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog(
      {
        // The same answer twice: the release is still uninstalling.
        passes: [FIRST_PASS, FIRST_PASS],
        checks: [
          () => new Error('muster: request timed out'),
          STILL_UNINSTALLING,
        ],
      },
      false,
    );
    await deleteCluster(user);

    // The check failed: the person may still try the pass.
    expect(
      await screen.findByText('muster: request timed out'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish removal' }));

    await waitFor(() =>
      expect(screen.getAllByTestId('delete-pass')).toHaveLength(2),
    );
    const [, second] = screen.getAllByTestId('delete-pass');
    expect(second).toHaveTextContent('Nothing more could be removed yet');
    expect(second).toHaveTextContent(
      'Still being removed: HelmRelease org-acme/demo1, OCIRepository org-acme/demo1, ConfigMap org-acme/demo1-cluster-values.',
    );
    expect(second).toHaveTextContent(UNINSTALL_STEP);
    expect(await screen.findByText(/^Checked at /)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Finish removal' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('muster: request timed out')).toBeNull();
    expect(writesOf(callTool)).toHaveLength(2);
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

  it('reads nothing left after Finish removal as the removal complete', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog(
      { passes: [FIRST_PASS, nothingLeftError], checks: [LEFTOVERS] },
      false,
    );
    await deleteCluster(user);
    await user.click(
      await screen.findByRole('button', { name: 'Finish removal' }),
    );

    expect(await screen.findByTestId('delete-complete')).toHaveTextContent(
      'demo1 is removed: nothing of it is left',
    );
    expect(writesOf(callTool)).toHaveLength(2);
    expect(screen.queryByText('cluster-manager refused')).toBeNull();
    expect(screen.queryByText(UNINSTALL_STEP)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Finish removal' }),
    ).not.toBeInTheDocument();
  });

  it('can be left while its dry runs are on their way: they write nothing', async () => {
    const onOpenChange = jest.fn();
    const muster = makeMusterApi();
    muster.callTool.mockImplementation(() => new Promise(() => {}));
    await renderDialog({}, false, onOpenChange, muster);
    await waitFor(() => expect(muster.callTool).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cannot be dismissed while the delete is on its way, and lets go once it lands', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    const muster = makeMusterApi();
    const dryRunsAndApply = muster.callTool.getMockImplementation()!;
    let land: () => void = () => {};
    muster.callTool.mockImplementation(async (name, args) => {
      if (!args.dryRun) {
        await new Promise<void>(resolve => {
          land = resolve;
        });
      }
      return dryRunsAndApply(name, args);
    });
    await renderDialog({}, false, onOpenChange, muster);
    await screen.findByTestId('what-goes');
    await user.type(screen.getByLabelText(/Type demo1 to confirm/), 'demo1');
    await user.click(screen.getByRole('button', { name: 'Delete cluster' }));

    await waitFor(() => expect(writesOf(muster.callTool)).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => land());
    expect(await screen.findByText(UNINSTALL_STEP)).toBeInTheDocument();
    // The header's X; the footer's button reads Close too once the delete landed.
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a cluster with nothing left as already removed', async () => {
    const { callTool } = await renderDialog({ gone: true });

    expect(await screen.findByTestId('delete-complete')).toHaveTextContent(
      'demo1 is already removed: nothing of it is left',
    );
    expect(screen.queryByTestId('delete-refused')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete cluster' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(writesOf(callTool)).toHaveLength(0);
  });
});

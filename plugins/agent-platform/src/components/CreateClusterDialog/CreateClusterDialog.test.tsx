import { renderInTestApp } from '@backstage/frontend-test-utils';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type {
  ClusterReleasesResult,
  ClusterWriteResult,
} from '../../lib/clusterManager';
import {
  CreateClusterDialog,
  clusterNameProblem,
  defaultRelease,
  parseValues,
} from './CreateClusterDialog';

jest.mock('../CodeBlock', () => ({
  CodeBlock: ({ filename, content }: { filename: string; content: string }) => (
    <pre data-testid={`code-${filename}`}>{content}</pre>
  ),
}));

// The organizations and the cloud identities are read from the installation's
// Kubernetes API; the dialog sees them as the kubernetes-react hook returns.
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (_installation: string, resourceClass: { kind: string }) => ({
    resources: (resourceClass.kind === 'Organization'
      ? ['acme']
      : ['default-identity']
    ).map(name => ({ getName: () => name })),
    isLoading: false,
    errors: [],
  }),
}));

const RELEASES: ClusterReleasesResult = {
  providers: ['aws'],
  releases: [
    {
      name: 'aws-34.0.0',
      provider: 'aws',
      version: '34.0.0',
      state: 'preview',
      releaseChart: {
        url: 'oci://x/release-aws',
        version: '34.0.0',
        published: true,
      },
      offered: false,
      note: 'state preview: create_cluster creates only active releases',
    },
    {
      name: 'aws-33.1.0',
      provider: 'aws',
      version: '33.1.0',
      state: 'active',
      kubernetesVersion: '1.33.4',
      releaseChart: {
        url: 'oci://x/release-aws',
        version: '33.1.0',
        published: true,
      },
      offered: true,
    },
  ],
};

const DRY_RUN: ClusterWriteResult = {
  cluster: 'demo1',
  namespace: 'org-acme',
  pool: '',
  mode: 'apply',
  dryRun: true,
  release: '33.1.0',
  objects: [
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      name: 'demo1',
      namespace: 'org-acme',
      action: 'would-create',
    },
  ],
  manifests: [
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: 'demo1', namespace: 'org-acme' },
    },
  ],
};

const COMMIT = {
  repository: 'acme/fleet',
  base: 'main',
  directory:
    'management-clusters/inst-1/organizations/acme/workload-clusters/demo1',
  kustomization: 'flux-giantswarm/inst-1-gitops',
  prune: true,
  branch: 'cluster-manager/demo1',
  files: [{ path: 'demo1/helmrelease.yaml', action: 'create' }],
};

type Scenario = {
  /** The installation's cluster-manager takes mode commit for create_cluster. */
  commit?: boolean;
  /** create_cluster in mode commit refuses: the organization is not reconciled from git. */
  commitRefused?: boolean;
  /** create_cluster refuses every call: muster's session is not connected. */
  notConnected?: boolean;
};

const NOT_FROM_GIT =
  'Organization acme: no Flux Kustomization reconciles it — commit mode needs the repository that owns it';

function makeMusterApi(scenario: Scenario = {}) {
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'x_cluster-manager_get_info':
          return {
            version: '0.25.1',
            modes: {
              apply: true,
              commit: scenario.commit ?? false,
              commitTools: ['create_cluster', 'delete_cluster'],
            },
            tools: ['create_cluster', 'delete_cluster', 'list_releases'],
          };
        case 'x_cluster-manager_list_releases':
          return RELEASES;
        case 'x_cluster-manager_list_clusters':
          return { clusters: [{ name: 'taken1', namespace: 'org-acme' }] };
        case 'x_cluster-manager_create_cluster': {
          if (scenario.notConnected) {
            throw new Error('tool not found: x_cluster-manager_create_cluster');
          }
          if (args.mode === 'commit') {
            if (scenario.commitRefused) {
              throw new Error(NOT_FROM_GIT);
            }
            return {
              ...DRY_RUN,
              mode: 'commit',
              dryRun: Boolean(args.dryRun),
              commit: args.dryRun
                ? COMMIT
                : {
                    ...COMMIT,
                    pullRequest: 'https://github.com/acme/fleet/pull/7',
                    number: 7,
                    author: 'jane',
                  },
            };
          }
          return args.dryRun
            ? DRY_RUN
            : {
                ...DRY_RUN,
                dryRun: false,
                objects: DRY_RUN.objects.map(o => ({
                  ...o,
                  action: 'created',
                })),
              };
        }
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

const analyticsApi = mockApis.analytics.mock();

beforeEach(() => jest.mocked(analyticsApi.captureEvent).mockClear());

async function renderDialog(scenario: Scenario = {}) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <CreateClusterDialog
          installations={['inst-1']}
          isOpen
          onOpenChange={() => {}}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

async function fillAndReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: /Pick an organization/ }),
  );
  await user.click(await screen.findByRole('option', { name: 'acme' }));
  await user.type(screen.getByLabelText(/^Name/), 'demo1');
  const review = screen.getByRole('button', { name: 'Review' });
  await waitFor(() => expect(review).toBeEnabled());
  await user.click(review);
  await screen.findByTestId('cluster-review');
}

const writesOf = (callTool: jest.Mock) =>
  callTool.mock.calls.filter(
    call =>
      call[0] === 'x_cluster-manager_create_cluster' &&
      !(call[1] as Record<string, unknown>).dryRun,
  );

describe('CreateClusterDialog', () => {
  it('preselects the newest release create_cluster offers and marks the others', async () => {
    await renderDialog();
    expect(
      await screen.findByRole('button', {
        name: /33\.1\.0 · Kubernetes 1\.33\.4/,
      }),
    ).toBeInTheDocument();
  });

  it('offers the cloud identities of the preselected aws line by name', async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(
      await screen.findByRole('button', { name: /The chart's default/ }),
    );
    expect(
      await screen.findByRole('option', { name: 'default-identity' }),
    ).toBeInTheDocument();
  });

  it('commits where git owns the organization, and shows the pull request', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({ commit: true });
    await fillAndReview(user);

    expect(screen.getByRole('radio', { name: /^Commit/ })).toBeChecked();
    expect(
      screen.getByText(
        /Deploy creates a cluster the repository does not know about/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('code-helmrelease-demo1.yaml'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Commit' }));
    expect(
      await screen.findByText('Pull request #7 opened as jane'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/acme/fleet/pull/7');
    expect(writesOf(callTool)).toEqual([
      [
        'x_cluster-manager_create_cluster',
        {
          organization: 'acme',
          name: 'demo1',
          provider: 'aws',
          release: '33.1.0',
          mode: 'commit',
        },
        'inst-1',
      ],
    ]);
    // The review's dry run reports nothing; the commit reports once.
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.clusterCreated',
        attributes: { mode: 'commit' },
      }),
    );
  });

  it('disables Commit with cluster-manager’s reason and deploys as the person', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({
      commit: true,
      commitRefused: true,
    });
    await fillAndReview(user);

    expect(screen.getByRole('radio', { name: /^Commit/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^Deploy/ })).toBeChecked();
    expect(
      screen.getByText(`Commit is not possible: ${NOT_FROM_GIT}`),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    expect(
      await screen.findByText('Cluster demo1 applied as you'),
    ).toBeInTheDocument();
    expect(writesOf(callTool)[0][1]).toMatchObject({ mode: 'apply' });
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.clusterCreated',
        attributes: { mode: 'apply' },
      }),
    );
  });

  it('never asks for mode commit where the installation does not offer it', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({ commit: false });
    await fillAndReview(user);

    expect(screen.getByRole('radio', { name: /^Commit/ })).toBeDisabled();
    expect(
      callTool.mock.calls.some(
        call => (call[1] as Record<string, unknown>).mode === 'commit',
      ),
    ).toBe(false);
  });

  it('offers the muster connect step when the session is not connected', async () => {
    const user = userEvent.setup();
    await renderDialog({ notConnected: true });
    await fillAndReview(user);
    expect(
      await screen.findByText('Connect to cluster-manager'),
    ).toBeInTheDocument();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});

describe('the form’s checks', () => {
  it('checks the name while typing', () => {
    expect(clusterNameProblem('', [])).toBeUndefined();
    expect(clusterNameProblem('demo1', [])).toBeUndefined();
    expect(clusterNameProblem('1demo', [])).toMatch(/starting with a letter/);
    expect(clusterNameProblem('a-name-of-21-letters1', [])).toMatch(
      /at most 20/,
    );
    expect(clusterNameProblem('taken1', ['taken1'])).toBe(
      'A cluster named taken1 already exists on this installation.',
    );
  });

  it('reads the values as a YAML mapping', () => {
    expect(parseValues('')).toEqual({});
    expect(parseValues('global:\n  controlPlane:\n    replicas: 3')).toEqual({
      values: { global: { controlPlane: { replicas: 3 } } },
    });
    expect(parseValues('- a').problem).toBe(
      'Values are a YAML mapping (key: value).',
    );
    expect(parseValues('a: [').problem).toBeDefined();
  });

  it('preselects the newest offered release of the line', () => {
    expect(defaultRelease(RELEASES.releases, 'aws')).toBe('33.1.0');
    expect(defaultRelease(RELEASES.releases, 'azure')).toBeUndefined();
  });
});

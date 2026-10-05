import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { gsAuthProvidersApiRef } from '../../../apis/auth';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../../../apis/installations';
import {
  ManagementClusterVersions,
  useManagementClusterVersionColumns,
  useManagementClusterVersions,
} from './useManagementClusterVersionColumns';

const row = (name: string) =>
  ({
    entity: {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name },
      spec: { type: 'installation' },
    },
  }) as unknown as CatalogTableRow;

const NO_RELEASE = {
  state: 'absent',
  reason: 'The management cluster carries no Giant Swarm release',
} as const;

function known(
  kubernetes: string,
  release?: string,
): ManagementClusterVersions {
  return {
    kubernetes: { state: 'known', version: kubernetes },
    release: release ? { state: 'known', version: release } : NO_RELEASE,
  };
}

/** The backend's answer for the fleet, or a pending or failed request. */
type Answer = Record<string, ManagementClusterVersions> | 'pending' | number;

function versionsFetch(answer: Answer, readInBrowser: string[] = []) {
  return jest.fn(async (_url: string, _init?: RequestInit) => {
    if (answer === 'pending') {
      return new Promise<Response>(() => {});
    }
    if (typeof answer === 'number') {
      return { ok: false, status: answer } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ installations: answer, readInBrowser }),
    } as Response;
  });
}

/** The Kubernetes plugin's proxy: `/version` for each browser-read installation, no CAPI. */
function browserProxy(versions: Record<string, string>) {
  return jest.fn(
    async ({ clusterName, path }: { clusterName: string; path: string }) =>
      path === '/version'
        ? ({
            ok: true,
            status: 200,
            json: async () => ({ gitVersion: versions[clusterName] }),
          } as Response)
        : ({
            ok: false,
            status: 404,
            statusText: '',
            json: async () => ({ message: 'not found' }),
          } as Response),
  );
}

let queryClient: QueryClient;

function wrapper(
  fetch: jest.Mock,
  options: { proxy?: jest.Mock; getIdToken?: () => Promise<string> } = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const getIdToken = options.getIdToken ?? (async () => 'main-id-token');
  return ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [fetchApiRef, { fetch }],
        [kubernetesApiRef, { proxy: options.proxy ?? browserProxy({}) } as any],
        [discoveryApiRef, { getBaseUrl: async () => 'http://backend/api/gs' }],
        [
          gsAuthProvidersApiRef,
          {
            getMainAuthApi: () => ({ getIdToken }),
          } as any,
        ],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

function Probe({ names }: { names: string[] }) {
  const columns = useManagementClusterVersionColumns();
  return (
    <div>
      <div data-testid="titles">
        {columns.map(c => String(c.title)).join(',')}
      </div>
      {names.map(name => (
        <div key={name} data-testid={`row-${name}`}>
          {columns.map(c => (
            <span key={String(c.title)}>{c.render?.(row(name), 'row')}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

async function renderProbe(
  installations: string[],
  answer: Answer,
  rows = installations,
  options: Parameters<typeof wrapper>[1] & { readInBrowser?: string[] } = {},
) {
  const fetch = versionsFetch(answer, options.readInBrowser);
  setInstallationsConfig(installations.map(name => ({ name })));
  const Wrapper = wrapper(fetch, options);
  await renderInTestApp(
    <Wrapper>
      <Probe names={rows} />
    </Wrapper>,
  );
  return fetch;
}

describe('useManagementClusterVersionColumns', () => {
  beforeEach(() => __resetInstallationsConfigForTests());

  it('shows every management cluster’s Kubernetes version and release from one request', async () => {
    const fetch = await renderProbe(['alpha', 'beta'], {
      alpha: known('v1.35.8', '35.1.1'),
      beta: known('v1.34.7', '34.4.0'),
    });

    expect(screen.getByTestId('titles')).toHaveTextContent(
      'Kubernetes version,Release',
    );
    expect(
      await screen.findByTestId('version-kubernetes-alpha'),
    ).toHaveTextContent('1.35.8');
    expect(screen.getByTestId('version-release-alpha')).toHaveTextContent(
      '35.1.1',
    );
    expect(screen.getByTestId('version-kubernetes-beta')).toHaveTextContent(
      '1.34.7',
    );
    expect(screen.getByTestId('version-release-beta')).toHaveTextContent(
      '34.4.0',
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://backend/api/gs/installations/versions');
    expect(init?.headers).toEqual({ 'gs-subject-token': 'main-id-token' });
  });

  it('never persists the person’s answer to the browser’s storage', async () => {
    await renderProbe(['alpha'], { alpha: known('v1.35.8') });

    await screen.findByTestId('version-kubernetes-alpha');
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: ['installations', 'management-cluster-versions'] })
        ?.meta,
    ).toEqual({ persist: false });
  });

  it('reads in the browser what the backend leaves to it', async () => {
    const proxy = browserProxy({ own: 'v1.33.4' });
    await renderProbe(
      ['alpha', 'own'],
      { alpha: known('v1.35.8') },
      undefined,
      {
        proxy,
        readInBrowser: ['own'],
      },
    );

    expect(
      await screen.findByTestId('version-kubernetes-own'),
    ).toHaveTextContent('1.33.4');
    expect(screen.getByTestId('version-kubernetes-alpha')).toHaveTextContent(
      '1.35.8',
    );
    expect(
      proxy.mock.calls.map(([{ clusterName }]) => clusterName),
    ).not.toContain('alpha');
  });

  it('shows a skeleton in every row while the versions load', async () => {
    await renderProbe(['alpha', 'beta'], 'pending');

    expect(
      await screen.findByTestId('version-kubernetes-alpha-loading'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('version-release-beta-loading'),
    ).toBeInTheDocument();
  });

  it('says why a version is missing: not connected, no release, request failed', async () => {
    const forbidden = { state: 'failed', reason: 'Access forbidden' } as const;
    await renderProbe(
      ['bare', 'locked'],
      {
        bare: known('v1.33.2'),
        locked: { kubernetes: forbidden, release: forbidden },
      },
      ['bare', 'locked', 'elsewhere'],
    );

    expect(
      await screen.findByTestId('version-kubernetes-bare'),
    ).toHaveTextContent('1.33.2');
    const noRelease = screen.getByTestId('version-release-bare');
    expect(noRelease).toHaveTextContent('—');
    expect(noRelease).toHaveAttribute(
      'title',
      'The management cluster carries no Giant Swarm release',
    );

    expect(screen.getByTestId('version-kubernetes-locked')).toHaveTextContent(
      'Access forbidden',
    );
    expect(screen.getByTestId('version-release-locked')).toHaveTextContent(
      'Access forbidden',
    );

    const notConnected = screen.getByTestId('version-kubernetes-elsewhere');
    expect(notConnected).toHaveTextContent('—');
    expect(notConnected).toHaveAttribute(
      'title',
      'This portal is not connected to the installation',
    );
  });

  it('shows the reason in every row when the versions cannot be read', async () => {
    await renderProbe(['alpha'], 403);

    expect(
      await screen.findByTestId('version-kubernetes-alpha'),
    ).toHaveTextContent('Access forbidden');
    expect(screen.getByTestId('version-release-alpha')).toHaveTextContent(
      'Access forbidden',
    );
  });

  it('says not signed in when the main sign-in is declined', async () => {
    await renderProbe(['alpha'], { alpha: known('v1.35.8') }, undefined, {
      getIdToken: async () => {
        throw Object.assign(new Error('Login failed, popup was closed'), {
          name: 'RejectedError',
        });
      },
    });

    const cell = await screen.findByTestId('version-kubernetes-alpha');
    expect(cell).toHaveTextContent('Not signed in');
    expect(cell).not.toHaveTextContent('popup');
  });

  it('keeps a failed read short in the cell, the details on hover', async () => {
    await renderProbe(['alpha'], 500);

    const cell = await screen.findByTestId('version-kubernetes-alpha');
    expect(cell).toHaveTextContent(/^Read failed$/);
    expect(cell).toHaveAttribute(
      'title',
      'The portal could not read the management cluster versions (HTTP 500)',
    );
  });

  it('sorts in semver order and matches the table search', async () => {
    const fetch = versionsFetch({
      a: known('v1.9.0', '9.0.0'),
      b: known('v1.35.8', '35.1.1'),
      c: known('v1.34.7', '34.4.0'),
    });
    setInstallationsConfig(['a', 'b', 'c'].map(name => ({ name })));

    const { result } = renderHook(
      () => ({
        versions: useManagementClusterVersions(),
        columns: useManagementClusterVersionColumns(),
      }),
      { wrapper: wrapper(fetch) },
    );

    await waitFor(() =>
      expect(
        ['a', 'b', 'c'].every(
          name => result.current.versions[name]?.release.state === 'known',
        ),
      ).toBe(true),
    );

    const [kubernetes, release] = result.current.columns;
    const rows = ['b', 'a', 'c'].map(row);
    const order = (column: typeof kubernetes) =>
      [...rows]
        .sort((x, y) => column.customSort!(x, y, 'row'))
        .map(r => r.entity.metadata.name);

    expect(order(kubernetes)).toEqual(['a', 'c', 'b']);
    expect(order(release)).toEqual(['a', 'c', 'b']);
    expect(
      rows
        .filter(r => kubernetes.customFilterAndSearch!('1.35', r, kubernetes))
        .map(r => r.entity.metadata.name),
    ).toEqual(['b']);
    expect(
      rows
        .filter(r => release.customFilterAndSearch!('34.', r, release))
        .map(r => r.entity.metadata.name),
    ).toEqual(['c']);
  });
});

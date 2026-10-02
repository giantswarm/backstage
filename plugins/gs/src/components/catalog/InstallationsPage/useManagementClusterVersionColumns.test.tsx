import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../../../apis/installations';
import {
  useManagementClusterVersionColumns,
  useManagementClusterVersions,
} from './useManagementClusterVersionColumns';

const GROUP = Cluster.group;

const row = (name: string) =>
  ({
    entity: {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name },
      spec: { type: 'installation' },
    },
  }) as unknown as CatalogTableRow;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function status(code: number) {
  return {
    ok: false,
    status: code,
    statusText: '',
    json: async () => ({ message: `status ${code}` }),
  } as Response;
}

type Fleet = Record<
  string,
  {
    /** `/version` of the API server; a number is an HTTP error status. */
    version: string | number | 'pending';
    /** The release label of the management cluster's own Cluster; none without. */
    release?: string;
    /** The installation serves no CAPI: the Cluster API is not found. */
    noCapi?: boolean;
  }
>;

/** A proxy serving each installation's `/version`, CAPI discovery and Cluster list. */
function fleetProxy(fleet: Fleet) {
  return jest.fn(
    async ({ clusterName, path }: { clusterName: string; path: string }) => {
      const mc = fleet[clusterName];
      if (path === '/version') {
        if (mc.version === 'pending') {
          return new Promise<Response>(() => {});
        }
        return typeof mc.version === 'number'
          ? status(mc.version)
          : ok({ gitVersion: mc.version });
      }
      if (mc.noCapi && path.startsWith(`/apis/${GROUP}`)) {
        return status(404);
      }
      if (path === `/apis/${GROUP}`) {
        return ok({
          name: GROUP,
          versions: [{ groupVersion: `${GROUP}/v1beta1`, version: 'v1beta1' }],
          preferredVersion: {
            groupVersion: `${GROUP}/v1beta1`,
            version: 'v1beta1',
          },
        });
      }
      if (path === `/apis/${GROUP}/v1beta1`) {
        return ok({
          groupVersion: `${GROUP}/v1beta1`,
          resources: [{ name: Cluster.plural }],
        });
      }
      if (
        path.startsWith(
          `/apis/${GROUP}/v1beta1/namespaces/org-giantswarm/${Cluster.plural}`,
        )
      ) {
        return ok({
          items: [
            {
              apiVersion: `${GROUP}/v1beta1`,
              kind: 'Cluster',
              metadata: {
                name: clusterName,
                namespace: 'org-giantswarm',
                labels: mc.release
                  ? { 'release.giantswarm.io/version': mc.release }
                  : {},
              },
            },
          ],
        });
      }
      return status(404);
    },
  );
}

function wrapper(proxy: jest.Mock) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, { proxy } as any]]}>
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

async function renderProbe(fleet: Fleet, rows: string[]) {
  const proxy = fleetProxy(fleet);
  setInstallationsConfig(Object.keys(fleet).map(name => ({ name })));
  const Wrapper = wrapper(proxy);
  await renderInTestApp(
    <Wrapper>
      <Probe names={rows} />
    </Wrapper>,
  );
  return proxy;
}

describe('useManagementClusterVersionColumns', () => {
  beforeEach(() => __resetInstallationsConfigForTests());

  it('shows each management cluster’s Kubernetes version and release', async () => {
    await renderProbe(
      {
        alpha: { version: 'v1.35.8', release: '35.1.1' },
        beta: { version: 'v1.34.7', release: '34.4.0' },
      },
      ['alpha', 'beta'],
    );

    expect(screen.getByTestId('titles')).toHaveTextContent(
      'Kubernetes version,Release',
    );
    expect(
      await screen.findByTestId('version-kubernetes-alpha'),
    ).toHaveTextContent('1.35.8');
    expect(
      await screen.findByTestId('version-release-alpha'),
    ).toHaveTextContent('35.1.1');
    expect(
      await screen.findByTestId('version-kubernetes-beta'),
    ).toHaveTextContent('1.34.7');
    expect(await screen.findByTestId('version-release-beta')).toHaveTextContent(
      '34.4.0',
    );
  });

  it('shows a skeleton while an installation has not answered, and the others’ versions', async () => {
    await renderProbe(
      {
        alpha: { version: 'v1.35.8', release: '35.1.1' },
        slow: { version: 'pending' },
      },
      ['alpha', 'slow'],
    );

    expect(
      await screen.findByTestId('version-kubernetes-alpha'),
    ).toHaveTextContent('1.35.8');
    expect(
      screen.getByTestId('version-kubernetes-slow-loading'),
    ).toBeInTheDocument();
  });

  it('says why a version is missing: not connected, no release, request failed', async () => {
    await renderProbe(
      {
        bare: { version: 'v1.33.2' },
        plain: { version: 'v1.34.0', noCapi: true },
        locked: { version: 403 },
      },
      ['bare', 'plain', 'locked', 'elsewhere'],
    );

    expect(
      await screen.findByTestId('version-kubernetes-plain'),
    ).toHaveTextContent('1.34.0');
    expect(await screen.findByTestId('version-release-plain')).toHaveAttribute(
      'title',
      'The management cluster carries no Giant Swarm release',
    );

    const noRelease = await screen.findByTestId('version-release-bare');
    expect(noRelease).toHaveTextContent('—');
    expect(noRelease).toHaveAttribute(
      'title',
      'The management cluster carries no Giant Swarm release',
    );

    expect(
      await screen.findByTestId('version-kubernetes-locked'),
    ).toHaveTextContent('Access forbidden');
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

  it('sorts in semver order and matches the table search', async () => {
    const proxy = fleetProxy({
      a: { version: 'v1.9.0', release: '9.0.0' },
      b: { version: 'v1.35.8', release: '35.1.1' },
      c: { version: 'v1.34.7', release: '34.4.0' },
    });
    setInstallationsConfig(['a', 'b', 'c'].map(name => ({ name })));

    const { result } = renderHook(
      () => ({
        versions: useManagementClusterVersions(),
        columns: useManagementClusterVersionColumns(),
      }),
      { wrapper: wrapper(proxy) },
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

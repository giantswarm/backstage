import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  ClusterRoleBinding,
  RoleBinding,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { PlatformClusterRBAC } from './PlatformClusterRBAC';

const RBAC = 'rbac.authorization.k8s.io';

function clusterRoleBinding(
  name: string,
  role: string,
  subjects: object[],
): ClusterRoleBinding {
  return new ClusterRoleBinding(
    {
      apiVersion: `${RBAC}/v1`,
      kind: 'ClusterRoleBinding',
      metadata: { name },
      roleRef: { apiGroup: RBAC, kind: 'ClusterRole', name: role },
      subjects,
    } as any,
    'meadow',
  );
}

function roleBinding(
  name: string,
  namespace: string,
  role: string,
  subjects: object[],
): RoleBinding {
  return new RoleBinding(
    {
      apiVersion: `${RBAC}/v1`,
      kind: 'RoleBinding',
      metadata: { name, namespace },
      roleRef: { apiGroup: RBAC, kind: 'ClusterRole', name: role },
      subjects,
    } as any,
    'meadow',
  );
}

type Read = { resources: unknown[]; isLoading: boolean; errors: unknown[] };
let mockReads: { RoleBinding: Read; ClusterRoleBinding: Read };

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => {
  const actual = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  return {
    ...actual,
    useResources: (_installation: string, resourceClass: { kind: string }) =>
      mockReads[resourceClass.kind as 'RoleBinding' | 'ClusterRoleBinding'],
  };
});

jest.mock('../../clusters/ClusterDetailsPage/useCurrentCluster', () => ({
  useCurrentCluster: () => ({ installationName: 'meadow' }),
}));

const read = (resources: unknown[], extra: Partial<Read> = {}): Read => ({
  resources,
  isLoading: false,
  errors: [],
  ...extra,
});

function base() {
  return {
    ClusterRoleBinding: read([
      clusterRoleBinding('platform-admins', 'cluster-admin', [
        { kind: 'Group', apiGroup: RBAC, name: 'oidc:platform-admins' },
      ]),
      clusterRoleBinding('platform-readers', 'read-all', [
        { kind: 'Group', apiGroup: RBAC, name: 'oidc:fern-readers' },
      ]),
      clusterRoleBinding('system:coredns', 'system:coredns', [
        { kind: 'ServiceAccount', name: 'coredns', namespace: 'kube-system' },
      ]),
      clusterRoleBinding('system:discovery', 'system:discovery', [
        { kind: 'Group', apiGroup: RBAC, name: 'system:authenticated' },
      ]),
    ]),
    RoleBinding: read([
      roleBinding('organization-fern-readers', 'org-fern', 'view', [
        { kind: 'Group', apiGroup: RBAC, name: 'oidc:fern-readers' },
      ]),
      roleBinding('fern-deployer', 'org-fern', 'edit', [
        { kind: 'ServiceAccount', name: 'deployer', namespace: 'org-fern' },
      ]),
    ]),
  };
}

function rowOf(name: string) {
  return screen
    .getByRole('button', { name })
    .closest('[role=row]') as HTMLElement | null;
}

describe('PlatformClusterRBAC', () => {
  beforeEach(() => {
    mockReads = base();
  });

  it('lists the subjects with their kind, roles and scope, system ones hidden', async () => {
    await renderInTestApp(<PlatformClusterRBAC />);

    expect(
      screen.getByRole('heading', { name: 'Access grants (3 subjects)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Show system subjects (2)' }),
    ).not.toBeChecked();
    expect(
      screen.getAllByRole('columnheader').map(header => header.textContent),
    ).toEqual(['Subject', 'Kind', 'Roles', 'Access scope']);

    const readers = rowOf('oidc:fern-readers')!;
    expect(within(readers).getByText('Group')).toBeInTheDocument();
    expect(
      within(
        within(readers).getByRole('list', {
          name: 'Roles of oidc:fern-readers',
        }),
      )
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual(['read-all', 'view']);
    expect(
      within(readers).getByText('Cluster-wide, org-fern'),
    ).toBeInTheDocument();

    // A service account with its namespace.
    expect(
      within(rowOf('org-fern/deployer')!).getByText('ServiceAccount'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'system:authenticated' }),
    ).not.toBeInTheDocument();
  });

  it('shows the system subjects once switched on', async () => {
    await renderInTestApp(<PlatformClusterRBAC />);
    await userEvent.click(
      screen.getByRole('switch', { name: 'Show system subjects (2)' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Access grants (5 subjects)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'system:authenticated' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'kube-system/coredns' }),
    ).toBeInTheDocument();
  });

  it('opens a subject’s row to its bindings, and closes it again', async () => {
    await renderInTestApp(<PlatformClusterRBAC />);
    const toggle = screen.getByRole('button', { name: 'oidc:fern-readers' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const bindings = screen.getByRole('list', {
      name: 'Bindings of oidc:fern-readers',
    });
    expect(toggle).toHaveAttribute('aria-controls', bindings.id);
    expect(
      within(bindings)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual([
      'ClusterRoleBinding platform-readers grants ClusterRole read-all',
      'RoleBinding organization-fern-readers in namespace org-fern grants ClusterRole view',
    ]);

    await userEvent.click(toggle);
    expect(
      screen.queryByRole('list', { name: 'Bindings of oidc:fern-readers' }),
    ).not.toBeInTheDocument();
  });

  it('says when only system subjects have bindings', async () => {
    mockReads = {
      ClusterRoleBinding: read([
        clusterRoleBinding('system:discovery', 'system:discovery', [
          { kind: 'Group', apiGroup: RBAC, name: 'system:authenticated' },
        ]),
      ]),
      RoleBinding: read([]),
    };
    await renderInTestApp(<PlatformClusterRBAC />);

    expect(
      screen.getByRole('heading', { name: 'Access grants (0 subjects)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only system subjects have bindings here. Show system subjects to see them.',
      ),
    ).toBeInTheDocument();
  });

  it('says when there are no bindings to show', async () => {
    mockReads = { ClusterRoleBinding: read([]), RoleBinding: read([]) };
    await renderInTestApp(<PlatformClusterRBAC />);

    expect(screen.getByText('No RBAC bindings to show')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the skeleton while the bindings are read', async () => {
    mockReads = {
      ClusterRoleBinding: read([], { isLoading: true }),
      RoleBinding: read([], { isLoading: true }),
    };
    await renderInTestApp(<PlatformClusterRBAC />);

    expect(
      screen.getByRole('heading', { name: 'Access grants' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Show system subjects' }),
    ).toBeDisabled();
    expect(screen.getByText('Loading table data.')).toBeInTheDocument();
    expect(
      screen.queryByText('No RBAC bindings to show'),
    ).not.toBeInTheDocument();
  });

  it('says why when the bindings could not be read', async () => {
    const failed = {
      type: 'error',
      cluster: 'meadow',
      error: new Error('rolebindings is forbidden'),
    };
    mockReads = {
      ClusterRoleBinding: read([], { errors: [failed] }),
      RoleBinding: read([], { errors: [failed] }),
    };
    await renderInTestApp(<PlatformClusterRBAC />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Could not read the role bindings of meadow',
    );
    expect(alert).toHaveTextContent(
      'Reading role bindings requires cluster-wide read access.',
    );
  });

  it('lists what it read when one of the reads failed', async () => {
    mockReads = {
      ...base(),
      RoleBinding: read([], {
        errors: [
          { type: 'error', cluster: 'meadow', error: new Error('forbidden') },
        ],
      }),
    };
    await renderInTestApp(<PlatformClusterRBAC />);

    expect(
      screen.getByText('Some role bindings could not be read'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'oidc:platform-admins' }),
    ).toBeInTheDocument();
  });
});

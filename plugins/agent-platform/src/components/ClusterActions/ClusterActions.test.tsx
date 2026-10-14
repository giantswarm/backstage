import { render, screen } from '@testing-library/react';
import type { ClusterPageTarget } from '@giantswarm/backstage-plugin-gs';

import { CreateClusterAction, DeleteClusterAction } from './ClusterActions';

const mockTarget = jest.fn<ClusterPageTarget | undefined, []>();
const mockAvailability = jest.fn();

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useClusterPageTarget: () => mockTarget(),
  useInstallations: () => ({
    installations: [{ name: 'inst-1' }, { name: 'inst-2' }],
  }),
}));

jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: (installations: string[]) =>
    mockAvailability(installations),
  useClusterManagerInfo: (installation: string | undefined) => ({
    info: installation
      ? {
          version: '0.25.0',
          modes: { apply: true, commit: false },
          tools: ['delete_cluster'],
        }
      : undefined,
  }),
  useInstallationsOffering: (installations: string[]) => installations,
}));

jest.mock('../DeleteClusterDialog', () => ({
  DeleteClusterDialog: () => null,
}));
jest.mock('../CreateClusterDialog', () => ({
  CreateClusterDialog: () => null,
}));

const CREATED: ClusterPageTarget = {
  installationName: 'inst-1',
  name: 'demo1',
  namespace: 'org-acme',
  organization: 'acme',
  isManagementCluster: false,
  helmRelease: { name: 'demo1', namespace: 'org-acme' },
};

describe('DeleteClusterAction', () => {
  beforeEach(() => {
    mockAvailability.mockImplementation(() => ({
      presenceOf: () => 'available',
    }));
  });

  it('offers Delete on a cluster create_cluster made', () => {
    mockTarget.mockReturnValue(CREATED);

    render(<DeleteClusterAction />);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it.each<[string, ClusterPageTarget]>([
    ['an App-based cluster', { ...CREATED, helmRelease: undefined }],
    [
      'a cluster another HelmRelease rendered',
      { ...CREATED, helmRelease: { name: 'fleet', namespace: 'org-acme' } },
    ],
    [
      'a cluster whose HelmRelease is in another namespace',
      { ...CREATED, helmRelease: { name: 'demo1', namespace: 'org-other' } },
    ],
    [
      'a cluster outside its organization’s namespace',
      {
        ...CREATED,
        organization: 'other',
      },
    ],
    ['the management cluster', { ...CREATED, isManagementCluster: true }],
    [
      'the installation’s own cluster without the management label',
      {
        ...CREATED,
        name: 'inst-1',
        helmRelease: { name: 'inst-1', namespace: 'org-acme' },
      },
    ],
  ])('offers no Delete on %s, nor asks its cluster-manager', (_, target) => {
    mockTarget.mockReturnValue(target);

    render(<DeleteClusterAction />);

    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
    expect(mockAvailability).toHaveBeenLastCalledWith([]);
  });

  it('shows Delete disabled, with the reason, where muster has no per-user sign-in', () => {
    mockTarget.mockReturnValue(CREATED);
    mockAvailability.mockImplementation(() => ({
      presenceOf: () => 'sharedIdentity',
    }));

    render(<DeleteClusterAction />);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(
      screen.getByText(
        /Clusters are deleted through cluster-manager as you, and muster on inst-1 has no per-user sign-in in this portal/,
      ),
    ).toBeInTheDocument();
  });
});

describe('CreateClusterAction', () => {
  it('offers Create cluster where cluster-manager is reached as the person', () => {
    mockAvailability.mockImplementation(() => ({
      available: ['inst-1'],
      sharedIdentity: ['inst-2'],
      isLoading: false,
    }));

    render(<CreateClusterAction />);

    expect(
      screen.getByRole('button', { name: 'Create cluster' }),
    ).toBeEnabled();
  });

  it('shows Create cluster disabled, with the reason, where every muster has no per-user sign-in', () => {
    mockAvailability.mockImplementation(() => ({
      available: [],
      sharedIdentity: ['inst-1', 'inst-2'],
      isLoading: false,
    }));

    render(<CreateClusterAction />);

    expect(
      screen.getByRole('button', { name: 'Create cluster' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        /Clusters are created through cluster-manager as you, and muster on inst-1, inst-2 has no per-user sign-in in this portal/,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['while cluster-manager is still being looked for', [], true],
    ['where no muster lists cluster-manager', [], false],
  ])('offers nothing %s', (_, sharedIdentity, isLoading) => {
    mockAvailability.mockImplementation(() => ({
      available: [],
      sharedIdentity,
      isLoading,
    }));

    render(<CreateClusterAction />);

    expect(
      screen.queryByRole('button', { name: 'Create cluster' }),
    ).not.toBeInTheDocument();
  });
});

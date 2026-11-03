import { render, screen } from '@testing-library/react';

import { ModelHostingSharedIdentityNote } from './ModelHostingSharedIdentity';

let mockClusterManager = { sharedIdentity: [] as string[], isLoading: false };
let mockModelManager = { sharedIdentity: [] as string[], isLoading: false };

jest.mock('../ServingProvider', () => ({
  useServing: () => ({ reachableInstallations: ['alpha', 'beta'] }),
}));
jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: () => mockClusterManager,
}));
jest.mock('../../hooks/useModelManagerInstallations', () => ({
  useModelManagerInstallations: () => mockModelManager,
}));

describe('ModelHostingSharedIdentityNote', () => {
  beforeEach(() => {
    mockClusterManager = { sharedIdentity: [], isLoading: false };
    mockModelManager = { sharedIdentity: [], isLoading: false };
  });

  it('says nothing where every manager runs as the person', () => {
    const { container } = render(<ModelHostingSharedIdentityNote />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says why GPU node pools are withheld where only cluster-manager is affected', () => {
    mockClusterManager = { sharedIdentity: ['beta'], isLoading: false };
    render(<ModelHostingSharedIdentityNote />);

    expect(
      screen.getByText(
        'GPU node pools cannot be managed on beta from this portal',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /GPU node pools are managed through cluster-manager as you, and muster on beta has no per-user sign-in in this portal/,
      ),
    ).toBeInTheDocument();
  });

  it('says why serving is withheld where only model-manager is affected', () => {
    mockModelManager = { sharedIdentity: ['alpha'], isLoading: false };
    render(<ModelHostingSharedIdentityNote />);

    expect(
      screen.getByText('Models cannot be served on alpha from this portal'),
    ).toBeInTheDocument();
  });

  it('says it once for both managers', () => {
    mockClusterManager = { sharedIdentity: ['alpha'], isLoading: false };
    mockModelManager = { sharedIdentity: ['alpha', 'beta'], isLoading: false };
    render(<ModelHostingSharedIdentityNote />);

    expect(screen.getAllByText(/from this portal$/)).toHaveLength(1);
    expect(
      screen.getByText(
        'Models cannot be hosted on some environments from this portal',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/muster on alpha, beta has no per-user sign-in/),
    ).toBeInTheDocument();
  });

  it('waits until the managers have been looked for', () => {
    mockClusterManager = { sharedIdentity: ['beta'], isLoading: true };
    const { container } = render(<ModelHostingSharedIdentityNote />);

    expect(container).toBeEmptyDOMElement();
  });
});

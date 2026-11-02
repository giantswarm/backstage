import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ServingContextValue } from '../ServingProvider';
import { ServingLayerGate } from './ServingLayerGate';

const mockUseServing = jest.fn<
  Pick<ServingContextValue, 'installations' | 'unreachableInstallations'>,
  []
>();
jest.mock('../ServingProvider', () => ({
  hasServingLayer: jest.requireActual('../ServingProvider/ServingProvider')
    .hasServingLayer,
  ServingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useServing: () => mockUseServing(),
}));
jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

function renderGate() {
  render(
    <ServingLayerGate>
      <div>served</div>
    </ServingLayerGate>,
  );
}

describe('ServingLayerGate', () => {
  it('renders nothing while no installation has a serving layer', () => {
    mockUseServing.mockReturnValue({
      installations: [],
      unreachableInstallations: [],
    });
    renderGate();

    expect(screen.queryByText('served')).not.toBeInTheDocument();
  });

  it('renders its children for an installation with a serving layer', () => {
    mockUseServing.mockReturnValue({
      installations: ['gazelle'],
      unreachableInstallations: [],
    });
    renderGate();

    expect(screen.getByText('served')).toBeInTheDocument();
  });

  it('renders its children for an installation that could not be asked', () => {
    mockUseServing.mockReturnValue({
      installations: [],
      unreachableInstallations: ['glean'],
    });
    renderGate();

    expect(screen.getByText('served')).toBeInTheDocument();
  });
});

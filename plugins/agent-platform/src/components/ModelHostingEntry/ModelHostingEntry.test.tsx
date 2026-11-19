import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useLocation } from 'react-router-dom';
import { customizeExternalRouteRef, modelsRouteRef } from '../../routes';
import { ModelHostingEntry } from './ModelHostingEntry';

let mockServing: {
  isLoading: boolean;
  installations: string[];
  unreachableInstallations: string[];
};
let mockClusterManager: { available: string[]; isLoading: boolean };
jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: () => mockClusterManager,
}));
jest.mock('../ServingProvider', () => ({
  hasServingLayer: (serving: { installations: string[] }) =>
    serving.installations.length > 0,
  useServing: () => mockServing,
}));

const DESCRIPTION =
  'Run models on your own cluster nodes, so data stays in your clusters and cost is based on capacity, not tokens.';
const HINT_LINK = 'How to turn it on (opens in a new tab)';

function PathProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderEntry() {
  return renderInTestApp(
    <>
      <PathProbe />
      <ModelHostingEntry />
    </>,
    {
      initialRouteEntries: ['/customize/models'],
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

describe('ModelHostingEntry', () => {
  beforeEach(() => {
    mockServing = {
      isLoading: false,
      installations: [],
      unreachableInstallations: [],
    };
    mockClusterManager = { available: [], isLoading: false };
  });

  it('opens Model hosting from one link over the row, where a serving layer runs', async () => {
    mockServing.installations = ['golem'];
    await renderEntry();

    expect(screen.getByRole('link', { name: 'Model hosting' })).toHaveAttribute(
      'href',
      '/customize/models/hosting',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Model hosting' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: HINT_LINK })).toBeNull();

    // bui forwards a click anywhere on the row to its link.
    await userEvent.click(screen.getByText(DESCRIPTION));
    expect(screen.getByTestId('path')).toHaveTextContent(
      /^\/customize\/models\/hosting$/,
    );
  });

  it('offers it where cluster-manager runs without a serving layer', async () => {
    mockClusterManager.available = ['golem'];
    await renderEntry();
    expect(
      screen.getByRole('link', { name: 'Model hosting' }),
    ).toBeInTheDocument();
  });

  it('says what turns it on, in the same place, where it is not offered', async () => {
    await renderEntry();
    expect(screen.queryByRole('link', { name: 'Model hosting' })).toBeNull();
    expect(screen.getByRole('link', { name: HINT_LINK })).toBeInTheDocument();
  });

  it('says nothing while that is still read', async () => {
    mockServing.isLoading = true;
    await renderEntry();
    expect(screen.queryByRole('link', { name: 'Model hosting' })).toBeNull();
    expect(screen.queryByRole('link', { name: HINT_LINK })).toBeNull();
  });
});

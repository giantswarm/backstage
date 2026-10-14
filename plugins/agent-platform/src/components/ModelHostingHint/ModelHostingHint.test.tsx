import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { modelsRouteRef } from '../../routes';
import { MODEL_HOSTING_DOCS_URL, ModelHostingHint } from './ModelHostingHint';

let mockServing: {
  isLoading: boolean;
  installations: string[];
  unreachableInstallations: string[];
};

jest.mock('../ServingProvider', () => ({
  hasServingLayer: (serving: {
    installations: string[];
    unreachableInstallations: string[];
  }) =>
    serving.installations.length > 0 ||
    serving.unreachableInstallations.length > 0,
  useServing: () => mockServing,
}));

const hint = /appears here once an environment runs model-manager/;

function renderHint(mounted = true) {
  return renderInTestApp(<ModelHostingHint />, {
    mountedRoutes: mounted ? { '/agent-platform/models': modelsRouteRef } : {},
  });
}

describe('ModelHostingHint', () => {
  beforeEach(() => {
    mockServing = {
      isLoading: false,
      installations: [],
      unreachableInstallations: [],
    };
  });

  it('says what turns model hosting on, linking the configuration reference', async () => {
    await renderHint();
    expect(screen.getByText(hint)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'How to turn it on' });
    expect(link).toHaveAttribute('href', MODEL_HOSTING_DOCS_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('says nothing while the serving layer is still being read', async () => {
    mockServing.isLoading = true;
    await renderHint();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('says nothing when an environment has a serving layer', async () => {
    mockServing.installations = ['golem'];
    await renderHint();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('says nothing when one could not be asked (the entry covers it)', async () => {
    mockServing.unreachableInstallations = ['golem'];
    await renderHint();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('says nothing when this app mounts no Model hosting page', async () => {
    await renderHint(false);
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });
});

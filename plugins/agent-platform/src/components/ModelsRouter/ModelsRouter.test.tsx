import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` resolves
// against the new route-resolution API, which the classic test app lacks.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { ServingContextValue } from '../ServingProvider';
import { customizeExternalRouteRef, modelsRouteRef } from '../../routes';
import { ModelsRouter } from './ModelsRouter';

// The views are irrelevant here — this is about the tab's routing and which
// tabs model hosting offers — and stubbing them keeps the tree free of the
// kubernetes reads they do.
jest.mock('../NewModelPage', () => ({
  NewModelPage: () => <div>new-model-view</div>,
}));
jest.mock('../ServingPage', () => ({
  ServingPage: () => <div>serving-view</div>,
}));
jest.mock('../GpuCapacityPage', () => ({
  GpuCapacityPage: () => <div>capacity-view</div>,
}));
jest.mock('../ModelCachePage', () => ({
  ModelCachePage: () => <div>cache-view</div>,
}));
jest.mock('../ModelHostingKpis', () => ({
  ModelHostingKpis: ({ scope }: { scope?: string }) => (
    <div>hosting-kpis: {scope ?? 'all'}</div>
  ),
}));

// The section's installation scope, as far as the header's Environment
// control is concerned; the control and the scope note have their own tests,
// so markers stand in.
const scopeState = { isSingleInstallation: false, isLoading: false };
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationScope: () => scopeState,
}));
jest.mock('../EnvironmentSelect', () => ({
  EnvironmentSelect: ({ component }: { component?: string }) => (
    <div data-testid="environment-select">environment:{component}</div>
  ),
}));
jest.mock('../InstallationScopeNote', () => ({
  InstallationScopeNote: ({ component }: { component?: string }) => (
    <div data-testid="scope-note">note:{component}</div>
  ),
}));

// Whether an installation in view runs cluster-manager: what offers the GPU
// pools and the Model cache tab.
let mockClusterManager: string[] = [];
jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: () => ({
    available: mockClusterManager,
    isLoading: false,
  }),
}));

// The providers are pass-throughs; the serving snapshot the tab strip reads is
// driven per case.
const mockUseServing = jest.fn<Partial<ServingContextValue>, []>();
jest.mock('../ServingProvider', () => ({
  hasServingLayer: jest.requireActual('../ServingProvider/ServingProvider')
    .hasServingLayer,
  ServingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useServing: () => mockUseServing(),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../ServedModelRowsProvider', () => ({
  ServedModelRowsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

const CurrentPath = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
};

function renderTab(path: string) {
  return renderInTestApp(
    <Routes>
      <Route path="/customize/*" element={<CurrentPath />} />
      <Route
        path="/agent-platform/models/*"
        element={
          <>
            <ModelsRouter />
            <CurrentPath />
          </>
        }
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/agent-platform/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

const noServingLayer: Partial<ServingContextValue> = {
  isLoading: false,
  installations: [],
  unreachableInstallations: [],
};

const withServingLayer: Partial<ServingContextValue> = {
  isLoading: false,
  installations: ['inst-1'],
  unreachableInstallations: [],
};

describe('ModelsRouter', () => {
  beforeEach(() => {
    mockClusterManager = [];
    scopeState.isSingleInstallation = false;
    scopeState.isLoading = false;
    mockUseServing.mockReset();
    mockUseServing.mockReturnValue(noServingLayer);
  });

  it('sends the tab root to the Customize screen', async () => {
    mockUseServing.mockReturnValue(withServingLayer);
    renderTab('/agent-platform/models?installation=alpha');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/customize/models?installation=alpha',
      );
    });
  });

  describe('model hosting', () => {
    beforeEach(() => {
      mockUseServing.mockReturnValue(withServingLayer);
    });

    it('frames the serving views as one page with the standard title', async () => {
      renderTab('/agent-platform/models/capacity');

      expect(await screen.findByText(/^capacity-view/)).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Model hosting',
      );
      expect(
        screen.getByText(
          'Run models on your own GPUs, so data stays in your clusters.',
        ),
      ).toBeInTheDocument();

      const breadcrumbs = screen.getByRole('navigation', {
        name: 'Breadcrumb',
      });
      expect(
        within(breadcrumbs).getByRole('link', { name: 'Models' }),
      ).toHaveAttribute('href', '/customize/models');
      expect(
        within(breadcrumbs).getByText('Model hosting'),
      ).toBeInTheDocument();
    });

    it('offers the serving views as the page tabs, without Model configs', async () => {
      renderTab('/agent-platform/models/serving');

      expect(await screen.findByText('serving-view')).toBeInTheDocument();
      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Running models',
        'GPU capacity',
      ]);
      expect(screen.getByRole('tab', { name: 'GPU capacity' })).toHaveAttribute(
        'href',
        '/agent-platform/models/capacity',
      );
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Running models',
      );
    });

    it('names the tabs per the prototype where cluster-manager runs, the cache a tab of its own', async () => {
      mockClusterManager = ['inst-1'];
      renderTab('/agent-platform/models/capacity');

      expect(await screen.findByText('capacity-view')).toBeInTheDocument();
      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Running models',
        'GPU pools',
        'Model cache',
      ]);
      expect(screen.getByRole('tab', { name: 'Model cache' })).toHaveAttribute(
        'href',
        '/agent-platform/models/cache',
      );
    });

    it('routes the Model cache view', async () => {
      mockClusterManager = ['inst-1'];
      renderTab('/agent-platform/models/cache');

      expect(await screen.findByText('cache-view')).toBeInTheDocument();
    });

    it.each([
      ['serving', 'serving-view', 'all'],
      ['capacity', 'capacity-view', 'gpu'],
      ['cache', 'cache-view', 'cache'],
    ])(
      'heads the %s view with the figures about what it lists',
      async (view, content, scope) => {
        mockClusterManager = ['inst-1'];
        renderTab(`/agent-platform/models/${view}`);

        expect(await screen.findByText(content)).toBeInTheDocument();
        // One row, scoped: never the full row repeated on every tab.
        expect(screen.getAllByText(/^hosting-kpis/)).toHaveLength(1);
        expect(screen.getByText(`hosting-kpis: ${scope}`)).toBeInTheDocument();
      },
    );

    describe('environment scope', () => {
      it.each([
        ['serving', 'serving-view'],
        ['capacity', 'capacity-view'],
        ['cache', 'cache-view'],
      ])(
        "offers the Environment control in the %s view's header, before its actions",
        async (view, content) => {
          mockClusterManager = ['inst-1'];
          renderTab(`/agent-platform/models/${view}`);

          expect(await screen.findByText(content)).toBeInTheDocument();
          const header = screen
            .getByRole('heading', { level: 1 })
            .closest('div')?.parentElement?.parentElement as HTMLElement;
          // No component: the views read KServe, model-manager and
          // cluster-manager, none of which stands for the others.
          expect(
            within(header).getByTestId('environment-select'),
          ).toHaveTextContent(/^environment:$/);
        },
      );

      it('hides the Environment control on a single-installation portal', async () => {
        scopeState.isSingleInstallation = true;
        renderTab('/agent-platform/models/serving');

        expect(await screen.findByText('serving-view')).toBeInTheDocument();
        expect(screen.queryByTestId('environment-select')).toBeNull();
      });

      it('hides the Environment control while the installations are read', async () => {
        scopeState.isLoading = true;
        renderTab('/agent-platform/models/serving');

        expect(await screen.findByText('serving-view')).toBeInTheDocument();
        expect(screen.queryByTestId('environment-select')).toBeNull();
      });

      it('heads each view with the scope note, above its figures', async () => {
        renderTab('/agent-platform/models/serving');

        const note = await screen.findByTestId('scope-note');
        expect(note).toHaveTextContent(/^note:$/);
        expect(
          note.compareDocumentPosition(screen.getByText(/^hosting-kpis/)) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });

      it('keeps the installation scope in the tab links', async () => {
        renderTab('/agent-platform/models/serving?installation=inst-1');

        expect(await screen.findByText('serving-view')).toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: 'GPU capacity' }),
        ).toHaveAttribute(
          'href',
          '/agent-platform/models/capacity?installation=inst-1',
        );
      });
    });

    it('shows no figures on a portal without a serving layer', async () => {
      mockUseServing.mockReturnValue(noServingLayer);
      renderTab('/agent-platform/models/serving');

      expect(await screen.findByText('serving-view')).toBeInTheDocument();
      expect(screen.queryByText(/^hosting-kpis/)).toBeNull();
    });
  });

  it('routes the create flow directly under the tab', async () => {
    renderTab('/agent-platform/models/new');
    expect(await screen.findByText('new-model-view')).toBeInTheDocument();
  });

  it("redirects a model's former path to its page beside Customize › Models, keeping the query string", async () => {
    renderTab('/agent-platform/models/inst-1/kagent/qwen3?installation=alpha');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/customize/models/inst-1/kagent/qwen3?installation=alpha',
      );
    });
    expect(screen.queryByText('Model hosting')).toBeNull();
  });

  it('redirects the legacy configs view through the tab root, keeping the query string', async () => {
    renderTab('/agent-platform/models/configs?installation=alpha');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/customize/models?installation=alpha',
      );
    });
  });

  it('redirects the legacy create deep link, keeping the query string', async () => {
    renderTab('/agent-platform/models/configs/new?installation=alpha');

    expect(await screen.findByText('new-model-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/models/new?installation=alpha',
      );
    });
  });

  it("redirects a legacy model deep link to the model's page", async () => {
    renderTab('/agent-platform/models/configs/inst-1/kagent/qwen3');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/customize/models/inst-1/kagent/qwen3',
      );
    });
  });
});

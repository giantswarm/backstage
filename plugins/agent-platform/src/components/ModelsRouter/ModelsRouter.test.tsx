import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` resolves
// against the new route-resolution API, which the classic test app lacks.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { ServingContextValue } from '../ServingProvider';
import { modelsRouteRef } from '../../routes';
import { ModelsRouter } from './ModelsRouter';

// The views are irrelevant here — this is about the tab's routing and which
// second-level tabs it offers — and stubbing them keeps the tree free of the
// kubernetes reads they do.
jest.mock('../ModelConfigsPage', () => ({
  ModelConfigsPage: () => <div>configs-view</div>,
}));
jest.mock('../NewModelPage', () => ({
  NewModelPage: () => <div>new-model-view</div>,
}));
jest.mock('../ModelDetailPage', () => ({
  ModelDetailPage: () => <div>model-detail-view</div>,
}));
jest.mock('../ServingPage', () => ({
  ServingPage: () => <div>serving-view</div>,
}));
jest.mock('../GpuCapacityPage', () => ({
  GpuCapacityPage: () => <div>capacity-view</div>,
}));

// The providers are pass-throughs; the serving snapshot the tab strip reads is
// driven per case.
const mockUseServing = jest.fn<Partial<ServingContextValue>, []>();
jest.mock('../ServingProvider', () => ({
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
      mountedRoutes: { '/agent-platform/models': modelsRouteRef },
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
    mockUseServing.mockReset();
    mockUseServing.mockReturnValue(noServingLayer);
  });

  it('redirects the tab index to the Model configs view, keeping the query string', async () => {
    renderTab('/agent-platform/models?installation=alpha');

    expect(await screen.findByText('configs-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/models/configs?installation=alpha',
      );
    });
  });

  it('links the second-level tabs to absolute view paths', async () => {
    mockUseServing.mockReturnValue(withServingLayer);
    renderTab('/agent-platform/models/configs');

    expect(await screen.findByText('configs-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Model configs' })).toHaveAttribute(
      'href',
      '/agent-platform/models/configs',
    );
    expect(screen.getByRole('tab', { name: 'Serving' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
    expect(screen.getByRole('tab', { name: 'GPU capacity' })).toHaveAttribute(
      'href',
      '/agent-platform/models/capacity',
    );
  });

  it('offers only the Model configs tab while no installation has a serving layer', async () => {
    renderTab('/agent-platform/models/configs');

    expect(await screen.findByText('configs-view')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Model configs' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Serving' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'GPU capacity' }),
    ).not.toBeInTheDocument();
  });

  it('offers the serving tabs when an installation with a serving layer could not be read', async () => {
    mockUseServing.mockReturnValue({
      ...noServingLayer,
      unreachableInstallations: ['inst-3'],
    });
    renderTab('/agent-platform/models/configs');

    expect(await screen.findByText('configs-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Serving' })).toBeInTheDocument();
  });

  it('routes the Serving and GPU capacity views', async () => {
    mockUseServing.mockReturnValue(withServingLayer);
    const first = renderTab('/agent-platform/models/serving');
    expect(await screen.findByText('serving-view')).toBeInTheDocument();
    first.unmount();

    renderTab('/agent-platform/models/capacity');
    expect(await screen.findByText('capacity-view')).toBeInTheDocument();
  });

  it('still renders a deep-linked Serving view on a fleet without a serving layer', async () => {
    renderTab('/agent-platform/models/serving');

    expect(await screen.findByText('serving-view')).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Serving' }),
    ).not.toBeInTheDocument();
  });

  it('routes the create and detail flows under the Model configs view', async () => {
    const first = renderTab('/agent-platform/models/configs/new');
    expect(await screen.findByText('new-model-view')).toBeInTheDocument();
    first.unmount();

    renderTab('/agent-platform/models/configs/inst-1/kagent/qwen3');
    expect(await screen.findByText('model-detail-view')).toBeInTheDocument();
  });

  it('redirects the legacy create deep link, keeping the query string', async () => {
    renderTab('/agent-platform/models/new?installation=alpha');

    expect(await screen.findByText('new-model-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/models/configs/new?installation=alpha',
      );
    });
  });

  it('redirects a legacy model deep link to the detail under Model configs', async () => {
    renderTab('/agent-platform/models/inst-1/kagent/qwen3');

    expect(await screen.findByText('model-detail-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/models/configs/inst-1/kagent/qwen3',
      );
    });
  });
});

import { Route, Routes } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { modelsRouteRef } from '../../routes';
import { EditModelPage } from './EditModelPage';

const mockUseResource = jest.fn();
let mockMayUpdate = true;
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
  useSelfSubjectAccessReview: () => ({
    allowed: mockMayUpdate,
    isLoading: false,
  }),
}));

// The flow's environment choice, which an edit never shows.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  useInstallations: () => ({
    installations: [{ name: 'inst-1' }, { name: 'inst-2' }],
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    installationsWith: () => ['inst-1', 'inst-2'],
    isLoading: false,
    isProbing: false,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
}));

const mockSave = jest.fn();
jest.mock('../../hooks/useSaveModelConfig', () => ({
  useSaveModelConfig: () => ({
    save: mockSave,
    isSaving: false,
    error: undefined,
    reset: jest.fn(),
  }),
}));

function sonnet(
  overrides: {
    labels?: Record<string, string>;
    spec?: ModelConfigInterface['spec'];
  } = {},
) {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name: 'sonnet',
        namespace: 'kagent',
        annotations: { 'ui.giantswarm.io/display-name': 'Sonnet 4.5' },
        ...(overrides.labels ? { labels: overrides.labels } : {}),
      },
      spec: overrides.spec ?? {
        provider: 'Anthropic',
        model: 'claude-sonnet-4-5',
        apiKeySecret: 'kagent-sonnet',
        apiKeySecretKey: 'ANTHROPIC_API_KEY',
      },
    } as ModelConfigInterface,
    'inst-1',
  );
}

function renderPage() {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route
          path="/agent-platform/models/edit/:installation/:namespace/:name"
          element={<EditModelPage />}
        />
        <Route
          path="/agent-platform/models/:installation/:namespace/:name"
          element={<p>The model's page</p>}
        />
      </Routes>
    </PageHeaderActionsProvider>,
    {
      initialRouteEntries: ['/agent-platform/models/edit/inst-1/kagent/sonnet'],
      mountedRoutes: { '/agent-platform/models': modelsRouteRef },
    },
  );
}

describe('EditModelPage', () => {
  beforeEach(() => {
    mockMayUpdate = true;
    mockSave.mockReset();
    mockSave.mockResolvedValue(undefined);
    mockUseResource.mockReturnValue({
      resource: sonnet(),
      isLoading: false,
      errors: [],
    });
  });

  it('reads the model it was given', async () => {
    await renderPage();

    expect(mockUseResource).toHaveBeenCalledWith(
      'inst-1',
      ModelConfig,
      expect.objectContaining({ name: 'sonnet', namespace: 'kagent' }),
    );
  });

  it('opens the Connect-a-model flow prefilled, its primary Save changes', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit model' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Sonnet 4.5');
    // The document title names the model, like the skill edit frames.
    await waitFor(() =>
      expect(document.title).toBe('Edit Sonnet 4.5 · Models'),
    );
    // The locked technical name is said under the name, once.
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === 'P' &&
          element.textContent ===
            'Its technical name is sonnet; it cannot be changed.',
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Technical name/)).toBeNull();
    // The model stays on its environment: nothing to choose.
    expect(screen.queryByRole('button', { name: /Environment/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect model' })).toBeNull();

    await userEvent.type(screen.getByLabelText(/^API key/), 'sk-ant-new');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      installation: 'inst-1',
      values: expect.objectContaining({ apiKey: 'sk-ant-new' }),
      original: expect.any(ModelConfig),
    });
    expect(await screen.findByText("The model's page")).toBeInTheDocument();
  });

  it('says so while the model is being read', async () => {
    mockUseResource.mockReturnValue({
      resource: undefined,
      isLoading: true,
      errors: [],
    });
    await renderPage();

    expect(await screen.findByText('Reading the model…')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
  });

  it('says the model does not exist, with the way back', async () => {
    mockUseResource.mockReturnValue({
      resource: undefined,
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(screen.getByText('Model not found')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the model' }),
    ).toHaveAttribute('href', '/agent-platform/models/inst-1/kagent/sonnet');
  });

  it.each([
    [
      'asserted by GitOps tooling',
      () =>
        sonnet({ labels: { 'kustomize.toolkit.fluxcd.io/name': 'models' } }),
      /asserted by Flux, which would revert portal edits/,
    ],
    [
      'on a provider the form does not speak',
      () => sonnet({ spec: { provider: 'Bedrock', model: 'claude-sonnet' } }),
      /this one uses Bedrock\. Manage it with kubectl/,
    ],
  ])(
    'offers no form for a model %s, and says why',
    async (_case, make, why) => {
      mockUseResource.mockReturnValue({
        resource: make(),
        isLoading: false,
        errors: [],
      });
      await renderPage();

      expect(
        screen.getByText('This model cannot be edited from here'),
      ).toBeInTheDocument();
      expect(screen.getByText(why)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Name/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    },
  );

  it('offers no form without permission to change the model', async () => {
    mockMayUpdate = false;
    await renderPage();

    expect(
      screen.getByText('You do not have permission to change this model.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
  });
});

import { Route, Routes } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { customizeExternalRouteRef, modelsRouteRef } from '../../routes';
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
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({ modelConfigsFor: () => [], isLoading: false }),
}));

jest.mock('../../hooks/useModelNamespaces', () => ({
  useModelNamespaces: () => ({ namespaces: ['kagent'], isLoading: false }),
}));

// The organizations agent-manager names for the person: `org-acme` is one.
// A discovery failure belongs to the installation it names (`inst-1` unless
// a case says otherwise).
let mockDirectoryFailure: string | undefined;
let mockFailingInstallation = 'inst-1';
jest.mock('../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () => ({
    ...jest.requireActual('../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
    discoveryErrors: mockDirectoryFailure ? [mockDirectoryFailure] : [],
    discoveryFailureOf: (installation: string) =>
      installation === mockFailingInstallation
        ? mockDirectoryFailure
        : undefined,
  }),
}));

jest.mock('../../hooks/useSaveOrganizationModel', () => ({
  useSaveOrganizationModel: () => ({
    save: mockSave,
    isSaving: false,
    error: null,
    reset: jest.fn(),
  }),
}));

function sonnet(
  overrides: {
    namespace?: string;
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
        namespace: overrides.namespace ?? 'kagent',
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
          path="/customize/models/:installation/:namespace/:name/edit"
          element={<EditModelPage />}
        />
        <Route
          path="/customize/models/:installation/:namespace/:name"
          element={<p>The model's page</p>}
        />
      </Routes>
    </PageHeaderActionsProvider>,
    {
      initialRouteEntries: ['/customize/models/inst-1/kagent/sonnet/edit'],
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

describe('EditModelPage', () => {
  beforeEach(() => {
    mockDirectoryFailure = undefined;
    mockFailingInstallation = 'inst-1';
    mockMayUpdate = true;
    mockSave.mockReset();
    mockSave.mockResolvedValue({ isDefault: false });
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
    ).toHaveAttribute('href', '/customize/models/inst-1/kagent/sonnet');
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

  it("opens the form for an organization's model agent-manager wrote: the form saves it through agent-manager", async () => {
    mockUseResource.mockReturnValue({
      resource: sonnet({
        namespace: 'org-acme',
        labels: { 'app.kubernetes.io/managed-by': 'agent-manager' },
      }),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(
      screen.getByRole('switch', { name: 'Enter a new key on the next page' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This model cannot be edited from here'),
    ).toBeNull();
  });

  it("offers no form for an organization's model on a provider its gateway does not serve", async () => {
    mockUseResource.mockReturnValue({
      resource: sonnet({
        namespace: 'org-acme',
        spec: { provider: 'Ollama', model: 'qwen3', ollama: { host: 'x' } },
      }),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(screen.getByText(/this one uses Ollama/)).toBeInTheDocument();
  });

  it('edits a platform model through agent-manager', async () => {
    mockUseResource.mockReturnValue({
      resource: sonnet({
        labels: { 'app.kubernetes.io/managed-by': 'agent-manager' },
      }),
      isLoading: false,
      errors: [],
    });
    await renderPage();

    expect(
      screen.getByRole('heading', { name: 'Edit model' }),
    ).toBeInTheDocument();
  });

  it('offers no form without permission to change the model', async () => {
    mockMayUpdate = false;
    await renderPage();

    expect(
      screen.getByText('You do not have permission to change this model.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
  });
});

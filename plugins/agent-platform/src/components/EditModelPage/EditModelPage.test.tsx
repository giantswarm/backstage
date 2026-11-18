import { Route, Routes } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { customizeExternalRouteRef, modelsRouteRef } from '../../routes';
import { EditModelPage } from './EditModelPage';

// How the organization's content is written: live, as without commit mode,
// unless a case says otherwise.
let mockContentMode: 'apply' | 'commit' = 'apply';
jest.mock('../../hooks/useOrganizationContentMode', () => ({
  useOrganizationContentModeOf: () => mockContentMode,
}));

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

jest.mock('../../hooks/useModelSettingsSupport', () => ({
  useModelSettingsSupport: () => true,
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

/** A model Flux applies from its organization's git path. */
const fromGit = () =>
  sonnet({
    namespace: 'org-acme',
    labels: { 'kustomize.toolkit.fluxcd.io/name': 'org-acme' },
  });

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
    mockContentMode = 'apply';
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

  it.each([
    [
      'live',
      'apply',
      () =>
        sonnet({
          namespace: 'org-acme',
          labels: { 'app.kubernetes.io/managed-by': 'agent-manager' },
        }),
      'Agents on it pick up the change when you save.',
    ],
    [
      'by pull request',
      'commit',
      fromGit,
      'Saving opens a pull request. Agents on the model pick up the change after it is merged.',
    ],
  ] as const)(
    'says when agents pick up a change saved %s',
    async (_case, mode, make, sentence) => {
      mockContentMode = mode;
      mockUseResource.mockReturnValue({
        resource: make(),
        isLoading: false,
        errors: [],
      });
      await renderPage();

      expect(screen.getByText(sentence)).toBeInTheDocument();
    },
  );

  it('says why the next save waits once a save opened a pull request, with its link', async () => {
    mockContentMode = 'commit';
    mockUseResource.mockReturnValue({
      resource: fromGit(),
      isLoading: false,
      errors: [],
    });
    const pullRequest = 'https://github.com/example/organizations/pull/12';
    mockSave.mockResolvedValue({
      isDefault: false,
      commit: { pullRequest, number: 12 },
    });
    await renderPage();

    await userEvent.type(screen.getByLabelText(/^Name/), ' new');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/^Pull request #12 opened/);

    // The next change, a new key, waits for the merge, and says so.
    await userEvent.click(
      screen.getByRole('switch', { name: 'Enter a new key on the next page' }),
    );
    const next = screen.getByRole('button', { name: 'Continue to credential' });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription(
      'Pull request #12 holds this change. Edit the model again after it is merged.',
    );
    expect(screen.getByRole('link', { name: '#12' })).toHaveAttribute(
      'href',
      pullRequest,
    );
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

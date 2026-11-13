import { Route, Routes } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerError } from '../../lib/agentManager';
import { modelsRouteRef, organizationsRouteRef } from '../../routes';
import { NewModelPage, type ModelEdit } from './NewModelPage';

// The organizations agent-manager names for the person
// (`list_organizations`), and why they could not be read, when a case says.
let mockDirectoryFailure: string | undefined;
// agent-manager there wants the person's sign-in, when a case says.
let mockSignIn: { message: string; signInRequired: boolean } | undefined;
const mockRecheck = jest.fn(async () => {});
jest.mock('../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () => ({
    ...jest.requireActual('../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
    failureOf: () => mockDirectoryFailure,
    signInOf: () => mockSignIn,
    recheck: mockRecheck,
  }),
}));

// The alert's own sign-in is the muster plugin's: what it calls once the
// sign-in lands is what matters here.
jest.mock('../ConnectAgentManagerAlert', () => ({
  ConnectAgentManagerAlert: ({
    installation,
    message,
    onSignedIn,
  }: {
    installation: string;
    message: string;
    onSignedIn?: () => void;
  }) => (
    <div>
      sign in to agent-manager on {installation}: {message}
      {onSignedIn && (
        <button type="button" onClick={onSignedIn}>
          Sign-in lands
        </button>
      )}
    </div>
  ),
}));

let mockInstallationNames = ['golem'];
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  useInstallations: () => ({
    installations: mockInstallationNames.map(name => ({ name })),
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    installationsWith: () => mockInstallationNames,
    isLoading: false,
    isProbing: false,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
}));

const mockSave = jest.fn();

type MockModel = {
  getName(): string;
  getNamespace(): string;
  getDisplayName(): string;
  getAnnotations(): Record<string, string | undefined>;
  getLabels(): Record<string, string | undefined>;
  getOwnerReferences(): never[];
};
const mockOrganizationSave = jest.fn();
let mockOrganizationError: Error | null = null;
jest.mock('../../hooks/useSaveOrganizationModel', () => ({
  useSaveOrganizationModel: () => ({
    save: (input: { organization?: unknown }) =>
      input.organization ? mockOrganizationSave(input) : mockSave(input),
    isSaving: false,
    error: mockOrganizationError,
    reset: jest.fn(),
  }),
}));

let mockModelConfigs: MockModel[] = [];
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({
    modelConfigsFor: () => mockModelConfigs,
    isLoading: false,
  }),
}));

let mockNamespaces = ['kagent'];
let mockNamespacesLoading = false;
jest.mock('../../hooks/useModelNamespaces', () => ({
  useModelNamespaces: () => ({
    namespaces: mockNamespaces,
    isLoading: mockNamespacesLoading,
  }),
}));

jest.mock('../../lib/modelConfigs', () => ({
  ...jest.requireActual('../../lib/modelConfigs'),
  modelConfigOwner: (mc: MockModel) =>
    mc.getLabels()['app.kubernetes.io/managed-by'],
}));

function mockModel(
  namespace: string,
  name: string,
  {
    marked = false,
    helm = false,
    managedBy,
  }: { marked?: boolean; helm?: boolean; managedBy?: string } = {},
): MockModel {
  return {
    getName: () => name,
    getNamespace: () => namespace,
    getDisplayName: () => name,
    getAnnotations: () =>
      marked
        ? { 'agent-platform.giantswarm.io/is-default-model-config': 'true' }
        : {},
    getLabels: () => {
      if (helm) {
        return { 'app.kubernetes.io/managed-by': 'Helm' };
      }
      return managedBy ? { 'app.kubernetes.io/managed-by': managedBy } : {};
    },
    getOwnerReferences: () => [],
  };
}

let mockServingInstallations: string[] | undefined;
jest.mock('../ServingProvider', () => ({
  hasServingLayer: (serving: { installations: string[] }) =>
    serving.installations.length > 0,
  useOptionalServing: () =>
    mockServingInstallations
      ? {
          installations: mockServingInstallations,
          unreachableInstallations: [],
        }
      : undefined,
}));

function renderPage(edit?: ModelEdit) {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route path="/" element={<NewModelPage edit={edit} />} />
        <Route
          path="/customize/models/inst-1/kagent/sonnet"
          element={<p>The model's page</p>}
        />
        <Route
          path="/organizations/golem/org-parent/acme/credentials/:operation"
          element={<p>The credential form</p>}
        />
      </Routes>
    </PageHeaderActionsProvider>,
    {
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/organizations': organizationsRouteRef,
      },
    },
  );
}

const moreOptions = () =>
  screen.getByText('More options').closest('details') as HTMLDetailsElement;

beforeEach(() => {
  mockServingInstallations = undefined;
  mockInstallationNames = ['golem'];
  mockModelConfigs = [];
  mockNamespaces = ['kagent'];
  mockNamespacesLoading = false;
  mockDirectoryFailure = undefined;
  mockSignIn = undefined;
  mockRecheck.mockClear();
  mockSave.mockReset();
  mockSave.mockResolvedValue({ isDefault: false });
  mockOrganizationSave.mockReset();
  mockOrganizationSave.mockResolvedValue({
    isDefault: false,
    form: `/organizations/golem/org-parent/acme/credentials/${'b2'.repeat(24)}`,
  });
  mockOrganizationError = null;
});

describe('NewModelPage', () => {
  it('says "Connect a model" in its title and on its button', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Connect a model' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue to credential' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Add model/)).toBeNull();
  });

  it('fills the technical name from the display name, under More options', async () => {
    await renderPage();

    const technicalName = screen.getByLabelText(/^Technical name/);
    expect(moreOptions()).not.toHaveAttribute('open');
    expect(moreOptions()).toContainElement(technicalName);

    await userEvent.type(screen.getByLabelText(/^Name/), 'Sonnet 4.5');
    expect(technicalName).toHaveValue('sonnet-4-5');
    expect(moreOptions().querySelector('summary')).toHaveTextContent(
      'More options · technical name sonnet-4-5',
    );
  });

  it('stops filling the technical name once the person types one', async () => {
    await renderPage();

    await userEvent.click(screen.getByText('More options'));
    const technicalName = screen.getByLabelText(/^Technical name/);
    await userEvent.type(technicalName, 'my-model');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Sonnet');
    expect(technicalName).toHaveValue('my-model');
  });

  it('keeps TLS verification under More options', async () => {
    await renderPage();

    const tls = screen.getByRole('switch', {
      name: /Skip TLS certificate verification/,
    });
    expect(moreOptions()).toContainElement(tls);
  });

  it('says a first model becomes the default, with nothing to decide', async () => {
    await renderPage();

    expect(
      screen.getByText(
        'The platform has no default model yet, so this one becomes it.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Make this the default model' }),
    ).toBeNull();
  });

  it('offers to move the default, and saves the move with the mark it showed', async () => {
    mockModelConfigs = [mockModel('kagent', 'sonnet', { marked: true })];
    await renderPage();

    expect(
      screen.getByText(
        'The default now is sonnet. Agents that run on it keep it.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Make this the default model' }),
    );
    await userEvent.type(screen.getByLabelText(/^Name/), 'Opus');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Model/ }),
      'opus',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue to credential' }),
    );

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      namespace: 'kagent',
      makeDefault: true,
    });
  });

  it('makes the new model the default beside an unmarked default-model-config', async () => {
    mockModelConfigs = [mockModel('kagent', 'default-model-config')];
    await renderPage();

    expect(
      screen.getByText(/has no default model yet, so this one becomes it\./),
    ).toBeInTheDocument();
  });

  it('cannot move a default Helm values set', async () => {
    mockModelConfigs = [
      mockModel('kagent', 'sonnet', { marked: true, helm: true }),
    ];
    await renderPage();

    expect(
      screen.getByRole('checkbox', { name: 'Make this the default model' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/set in a Helm release's values\. Move it there\./),
    ).toBeInTheDocument();
  });

  it('holds Connect model, saying why, until the Owner choices are known', async () => {
    // Only the platform's so far: an Organization may still join the choices.
    mockNamespacesLoading = true;
    await renderPage();

    const connect = screen.getByRole('button', {
      name: 'Continue to credential',
    });
    expect(connect).toBeDisabled();
    expect(connect).toHaveAccessibleDescription(
      'Checking which Organizations you may add a model for…',
    );
    expect(screen.queryByRole('button', { name: /Owner/ })).toBeNull();
  });

  it("says a new model goes to the platform when the environment's Organizations could not be read", async () => {
    mockDirectoryFailure =
      'backend_error: the API server did not answer in time';
    await renderPage();

    expect(screen.getByText('Organizations unknown')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Could not learn which Organizations you may add a model for on golem, so this model goes to the platform\. backend_error: the API server did not answer in time/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue to credential' }),
    ).not.toHaveAccessibleDescription();
  });

  it('holds Connect model and offers the sign-in while agent-manager there wants it', async () => {
    const message =
      "auth_required: server 'agent-manager' requires authentication; sign in to it to use its tools.";
    mockSignIn = { message, signInRequired: true };
    await renderPage();

    const connect = screen.getByRole('button', {
      name: 'Continue to credential',
    });
    expect(connect).toBeDisabled();
    expect(connect).toHaveAccessibleDescription(
      'Sign in on golem first: the connector tells which Organizations you may add a model for.',
    );
    expect(
      screen.getByText(`sign in to agent-manager on golem: ${message}`),
    ).toBeInTheDocument();
    // Not a failure that sends the model to the platform.
    expect(screen.queryByText('Organizations unknown')).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign-in lands' }),
    );
    expect(mockRecheck).toHaveBeenCalledWith('golem');
  });

  it('says nothing of Organizations once they are read', async () => {
    await renderPage();

    expect(screen.queryByText('Organizations unknown')).toBeNull();
  });

  it("moves an organization's default that agent-manager wrote, through agent-manager", async () => {
    mockNamespaces = ['kagent', 'org-acme'];
    mockModelConfigs = [
      mockModel('org-acme', 'sonnet', {
        marked: true,
        managedBy: 'agent-manager',
      }),
    ];
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Owner/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'acme' }));
    const makeDefault = screen.getByRole('checkbox', {
      name: 'Make this the default model',
    });
    expect(makeDefault).toBeEnabled();
    await userEvent.click(makeDefault);
    await userEvent.type(screen.getByLabelText(/^Name/), 'opus');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Model/ }),
      'claude-opus',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue to credential' }),
    );

    await waitFor(() => expect(mockOrganizationSave).toHaveBeenCalledTimes(1));
    expect(mockOrganizationSave.mock.calls[0][0]).toMatchObject({
      makeDefault: true,
    });
  });

  it("says plainly when the person may not change an organization's models", async () => {
    mockNamespaces = ['kagent', 'org-acme'];
    mockOrganizationError = new AgentManagerError(
      'forbidden',
      'you may not create modelconfigs in org-acme',
    );
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Owner/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'acme' }));

    expect(screen.getByText('Not permitted')).toBeInTheDocument();
    expect(
      screen.getByText(/Only an admin of the organization acme/),
    ).toBeInTheDocument();
  });

  it('opens More options when the technical name blocks the submit', async () => {
    await renderPage();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Sonnet');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Model/ }),
      'claude-sonnet-4-5',
    );
    const technicalName = screen.getByLabelText(/^Technical name/);
    await userEvent.clear(technicalName);
    await userEvent.type(technicalName, 'Not_Valid');
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue to credential' }),
    );

    expect(moreOptions()).toHaveAttribute('open');
    expect(technicalName).toHaveAttribute('aria-invalid', 'true');
    expect(technicalName).toHaveAccessibleDescription(
      expect.stringContaining('lowercase letters'),
    );
    await waitFor(() => expect(technicalName).toHaveFocus());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('introduces itself plainly, pointing at model hosting only where it exists', async () => {
    const { unmount } = await renderPage();
    expect(
      screen.getByText(/^Agents run on the models you connect here\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ModelConfig/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Model hosting' }),
    ).not.toBeInTheDocument();
    unmount();

    mockServingInstallations = ['golem'];
    await renderPage();
    expect(screen.getByRole('link', { name: 'Model hosting' })).toHaveAttribute(
      'href',
      '/customize/models/hosting',
    );
  });
});

describe('NewModelPage · editing a model', () => {
  const sonnet = () =>
    new ModelConfig(
      {
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'ModelConfig',
        metadata: {
          name: 'sonnet',
          namespace: 'kagent',
          annotations: { 'ui.giantswarm.io/display-name': 'Sonnet 4.5' },
        },
        spec: {
          provider: 'Anthropic',
          model: 'claude-sonnet-4-5',
          apiKeySecret: 'kagent-sonnet',
          apiKeySecretKey: 'ANTHROPIC_API_KEY',
          tls: { disableVerify: true },
        },
      } as ModelConfigInterface,
      'inst-1',
    );
  const editOf = (modelConfig = sonnet()): ModelEdit => ({
    installation: 'inst-1',
    modelConfig,
    detailHref: '/customize/models/inst-1/kagent/sonnet',
  });

  it('saves the change against the model and returns to its page', async () => {
    const modelConfig = sonnet();
    await renderPage(editOf(modelConfig));

    const model = screen.getByRole('textbox', { name: /^Model/ });
    await userEvent.clear(model);
    await userEvent.type(model, 'claude-sonnet-4-6');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      namespace: 'kagent',
      values: expect.objectContaining({
        name: 'sonnet',
        model: 'claude-sonnet-4-6',
      }),
      original: modelConfig,
    });
    expect(await screen.findByText("The model's page")).toBeInTheDocument();
  });
});

describe("NewModelPage · editing an organization's model", () => {
  const acmeSonnet = () =>
    new ModelConfig(
      {
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'ModelConfig',
        metadata: {
          name: 'sonnet',
          namespace: 'org-acme',
          labels: { 'app.kubernetes.io/managed-by': 'agent-manager' },
        },
        spec: {
          provider: 'Anthropic',
          model: 'claude-sonnet-4-5',
          apiKeySecret: 'tenant-credential-sonnet',
          apiKeySecretKey: 'apiKey',
          anthropic: { baseUrl: 'http://llm-listener.example' },
        },
      } as ModelConfigInterface,
      'golem',
    );
  const editOf = (modelConfig = acmeSonnet()): ModelEdit => ({
    installation: 'golem',
    modelConfig,
    detailHref: '/customize/models/inst-1/kagent/sonnet',
  });

  it('continues to the credential form for a new key', async () => {
    await renderPage(editOf());

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await userEvent.click(
      screen.getByRole('switch', { name: 'Enter a new key on the next page' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue to credential' }),
    );

    expect(await screen.findByText('The credential form')).toBeInTheDocument();
    expect(mockOrganizationSave).toHaveBeenCalledWith(
      expect.objectContaining({ replaceKey: true }),
    );
  });

  it("keeps the provider: its key is the provider's, and a new provider and its key cannot be saved in one step", async () => {
    await renderPage(editOf());

    const provider = screen.getByRole('button', { name: /Provider/ });
    expect(provider).toBeDisabled();
    expect(
      screen.getByText(/It cannot be changed: the stored key is this provider/),
    ).toBeInTheDocument();
  });
});

describe('NewModelPage · the environment select at scale', () => {
  const openEnvironments = async () =>
    userEvent.click(screen.getByRole('button', { name: /Environment/ }));

  it('offers type-ahead over three environments', async () => {
    mockInstallationNames = ['golem', 'snail', 'wombat'];
    await renderPage();

    await openEnvironments();
    expect(
      await screen.findByRole('option', { name: 'wombat' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('offers type-ahead over 300 environments', async () => {
    mockInstallationNames = Array.from(
      { length: 300 },
      (_, i) => `inst-${String(i).padStart(3, '0')}`,
    );
    await renderPage();

    await openEnvironments();
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
  });
});

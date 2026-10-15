import { Route, Routes } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { modelsRouteRef } from '../../routes';
import { NewModelPage, type ModelEdit } from './NewModelPage';

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
jest.mock('../../hooks/useSaveModelConfig', () => ({
  useSaveModelConfig: () => ({
    save: mockSave,
    isSaving: false,
    error: undefined,
    reset: jest.fn(),
  }),
}));

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
      </Routes>
    </PageHeaderActionsProvider>,
    { mountedRoutes: { '/agent-platform/models': modelsRouteRef } },
  );
}

const moreOptions = () =>
  screen.getByText('More options').closest('details') as HTMLDetailsElement;

beforeEach(() => {
  mockServingInstallations = undefined;
  mockInstallationNames = ['golem'];
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
});

describe('NewModelPage', () => {
  it('says "Connect a model" in its title and on its button', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Connect a model' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect model' }),
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

  it('has no "requires no API key" switch: the key is simply optional', async () => {
    await renderPage();

    expect(screen.queryByText(/requires no API key/)).toBeNull();
    const apiKey = screen.getByLabelText(/^API key/);
    expect(apiKey).toHaveAccessibleDescription(
      expect.stringContaining('Leave it empty if the endpoint needs none'),
    );

    await userEvent.type(screen.getByLabelText(/^Name/), 'Local vLLM');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Model/ }),
      'qwen3-8b',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Connect model' }),
    );

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toEqual({
      installation: 'golem',
      values: expect.objectContaining({
        name: 'local-vllm',
        model: 'qwen3-8b',
        apiKey: '',
      }),
      original: undefined,
    });
    expect(mockSave.mock.calls[0][0].values).not.toHaveProperty('keyless');
  });

  it('marks each missing field itself on a blocked submit and focuses the first', async () => {
    await renderPage();

    const displayName = screen.getByLabelText(/^Name/);
    const model = screen.getByRole('textbox', { name: /^Model/ });
    expect(displayName).not.toHaveAttribute('aria-invalid');

    await userEvent.click(
      screen.getByRole('button', { name: 'Connect model' }),
    );

    expect(displayName).toHaveAttribute('aria-invalid', 'true');
    expect(displayName).toHaveAccessibleDescription(
      expect.stringContaining('Enter a name for the model.'),
    );
    expect(displayName).toHaveFocus();
    expect(model).toHaveAttribute('aria-invalid', 'true');
    expect(model).toHaveAccessibleDescription(
      expect.stringContaining('Enter the model id.'),
    );
    // The technical name is only empty because the display name is: More
    // options stays closed, its field unflagged, and the key is optional.
    expect(moreOptions()).not.toHaveAttribute('open');
    expect(screen.getByLabelText(/^Technical name/)).not.toHaveAttribute(
      'aria-invalid',
    );
    expect(screen.getByLabelText(/^API key/)).not.toHaveAttribute(
      'aria-invalid',
    );
    expect(mockSave).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Please fix the following/),
    ).not.toBeInTheDocument();

    // A fixed field drops its error while the others keep theirs.
    await userEvent.type(displayName, 'Sonnet');
    expect(displayName).not.toHaveAttribute('aria-invalid');
    expect(model).toHaveAttribute('aria-invalid', 'true');
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
      screen.getByRole('button', { name: 'Connect model' }),
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
      '/agent-platform/models/serving',
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

  it('is the same flow, prefilled, with Save changes waiting for a change', async () => {
    mockInstallationNames = ['golem', 'snail'];
    await renderPage(editOf());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit model' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Customize / Models / Sonnet 4.5')).toBeVisible();
    // An existing model stays where it is: no environment to choose.
    expect(screen.queryByRole('button', { name: /Environment/ })).toBeNull();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Sonnet 4.5');
    expect(screen.getByRole('textbox', { name: /^Model/ })).toHaveValue(
      'claude-sonnet-4-5',
    );
    // The locked technical name is said under the name, once.
    expect(screen.queryByLabelText(/^Technical name/)).toBeNull();
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === 'P' &&
          element.textContent ===
            'Its technical name is sonnet; it cannot be changed.',
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /Skip TLS certificate verification/ }),
    ).toBeChecked();
    expect(screen.getByLabelText(/^API key/)).toHaveAttribute(
      'placeholder',
      'Leave empty to keep the current key',
    );

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    // Typing does not touch the technical name of an existing model.
    await userEvent.type(screen.getByLabelText(/^Name/), ' (EU)');
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === 'P' &&
          element.textContent ===
            'Its technical name is sonnet; it cannot be changed.',
        ),
      ),
    ).toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it('saves the change against the model and returns to its page', async () => {
    const modelConfig = sonnet();
    await renderPage(editOf(modelConfig));

    const model = screen.getByRole('textbox', { name: /^Model/ });
    await userEvent.clear(model);
    await userEvent.type(model, 'claude-sonnet-4-6');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toEqual({
      installation: 'inst-1',
      values: expect.objectContaining({
        name: 'sonnet',
        model: 'claude-sonnet-4-6',
        apiKey: '',
      }),
      original: modelConfig,
    });
    expect(await screen.findByText("The model's page")).toBeInTheDocument();
  });

  it('says what an empty key means once the provider changes', async () => {
    await renderPage(editOf());

    await userEvent.click(screen.getByRole('button', { name: /Provider/ }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'OpenAI (or compatible)' }),
    );

    const apiKey = screen.getByLabelText(/^API key/);
    expect(apiKey).toHaveAttribute('placeholder', '');
    expect(apiKey).toHaveAccessibleDescription(
      expect.stringContaining(
        'The stored key is for Anthropic, not OpenAI (or compatible)',
      ),
    );
  });
});

describe('NewModelPage · Vertex AI', () => {
  const serviceAccountKey = (projectID: string) =>
    JSON.stringify(
      {
        type: 'service_account',
        project_id: projectID,
        private_key:
          '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n',
        client_email: `kagent@${projectID}.iam.gserviceaccount.com`,
        token_uri: 'https://oauth2.googleapis.com/token',
      },
      null,
      2,
    );
  const keyFile = (content: string, name = 'key.json') =>
    new File([content], name, { type: 'application/json' });
  const chooseKeyFile = (file: File) =>
    userEvent.upload(screen.getByLabelText('Service account key file'), file);
  const keyGroup = () =>
    screen.getByRole('group', { name: /^Service account key/ });

  async function chooseProvider(name: string) {
    await userEvent.click(screen.getByRole('button', { name: /Provider/ }));
    await userEvent.click(await screen.findByRole('option', { name }));
  }

  async function fillGemini() {
    await chooseProvider('Gemini on Vertex AI');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Gemini Pro');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Location/ }),
      'europe-west4',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Model/ }),
      'gemini-2.5-pro',
    );
  }

  it('asks for a location and a key file instead of an endpoint or a typed key', async () => {
    await renderPage();
    await chooseProvider('Claude on Vertex AI');

    expect(screen.getByRole('heading', { name: 'Provider' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Model' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /^Location/ })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Choose key file' }),
    ).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /^Project ID/ })).toBeNull();
    expect(screen.queryByLabelText(/^API key/)).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^Base URL/ })).toBeNull();
    expect(
      screen.queryByRole('switch', {
        name: /Skip TLS certificate verification/,
      }),
    ).toBeNull();
  });

  it('says what the key file names, takes its project and saves', async () => {
    await renderPage();
    await fillGemini();

    const key = serviceAccountKey('my-project-123');
    await chooseKeyFile(keyFile(key, 'my-project-123-abc.json'));

    const status = within(keyGroup()).getByRole('status');
    await waitFor(() =>
      expect(status).toHaveTextContent('Read from my-project-123-abc.json.'),
    );
    expect(status).toHaveTextContent(
      'Service account kagent@my-project-123.iam.gserviceaccount.com',
    );
    expect(status).toHaveTextContent('Project my-project-123');
    expect(status).not.toHaveTextContent('PRIVATE KEY');

    await userEvent.click(
      screen.getByRole('button', { name: 'Connect model' }),
    );
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].values).toEqual(
      expect.objectContaining({
        provider: 'GeminiVertexAI',
        name: 'gemini-pro',
        projectID: 'my-project-123',
        location: 'europe-west4',
        apiKey: key,
      }),
    );
  });

  it('says at once that a chosen file is not a key, and clears it when a key is chosen', async () => {
    await renderPage();
    await fillGemini();

    await chooseKeyFile(keyFile('{"type": "authorized_user"}'));

    const choose = screen.getByRole('button', { name: 'Choose another file' });
    await waitFor(() =>
      expect(choose).toHaveAccessibleDescription(
        expect.stringContaining('This file is not a service account key.'),
      ),
    );

    await chooseKeyFile(keyFile(serviceAccountKey('my-project-123')));
    await waitFor(() => expect(choose).not.toHaveAccessibleDescription());
  });

  it('asks for the key file only on submit, and moves the focus to it', async () => {
    await renderPage();
    await fillGemini();

    await userEvent.tab();
    expect(
      screen.queryByText('Choose the service account key file.'),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Connect model' }),
    );

    expect(mockSave).not.toHaveBeenCalled();
    const choose = screen.getByRole('button', { name: 'Choose key file' });
    expect(choose).toHaveAccessibleDescription(
      'Choose the service account key file.',
    );
    await waitFor(() => expect(choose).toHaveFocus());
  });

  it('checks the location when the person leaves it, and clears the error once fixed', async () => {
    await renderPage();
    await chooseProvider('Claude on Vertex AI');

    const location = screen.getByRole('textbox', { name: /^Location/ });
    await userEvent.type(location, 'Europe');
    expect(location).not.toHaveAttribute('aria-invalid');

    await userEvent.tab();
    expect(location).toHaveAttribute('aria-invalid', 'true');
    expect(location).toHaveAccessibleDescription(
      expect.stringContaining(
        'Enter global, us, eu or a region such as europe-west4.',
      ),
    );

    await userEvent.clear(location);
    await userEvent.type(location, 'global');
    expect(location).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the stored key on an edit, and takes the project of a replacement', async () => {
    const modelConfig = new ModelConfig(
      {
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'ModelConfig',
        metadata: { name: 'sonnet', namespace: 'kagent' },
        spec: {
          provider: 'AnthropicVertexAI',
          model: 'claude-sonnet-4-5@20250929',
          apiKeySecret: 'kagent-sonnet',
          apiKeySecretKey: 'GOOGLE_APPLICATION_CREDENTIALS',
          anthropicVertexAI: {
            projectID: 'my-project-123',
            location: 'europe-west4',
          },
        },
      } as ModelConfigInterface,
      'inst-1',
    );
    await renderPage({
      installation: 'inst-1',
      modelConfig,
      detailHref: '/customize/models/inst-1/kagent/sonnet',
    });

    expect(keyGroup()).toHaveTextContent(
      'The stored key of project my-project-123 is kept.',
    );
    const location = screen.getByRole('textbox', { name: /^Location/ });
    expect(location).toHaveValue('europe-west4');
    await userEvent.clear(location);
    await userEvent.type(location, 'global');

    await chooseKeyFile(keyFile(serviceAccountKey('new-project')));
    await waitFor(() =>
      expect(keyGroup()).toHaveTextContent('Project new-project'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep the stored key' }),
    );
    expect(keyGroup()).toHaveTextContent(
      'The stored key of project my-project-123 is kept.',
    );

    await chooseKeyFile(keyFile(serviceAccountKey('new-project')));
    await waitFor(() =>
      expect(keyGroup()).toHaveTextContent('Project new-project'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].values).toEqual(
      expect.objectContaining({
        location: 'global',
        projectID: 'new-project',
        apiKey: serviceAccountKey('new-project'),
      }),
    );
  });
});

describe('NewModelPage · the environment select at scale', () => {
  const openEnvironments = async () =>
    userEvent.click(screen.getByRole('button', { name: /Environment/ }));

  it('offers three environments without a search', async () => {
    mockInstallationNames = ['golem', 'snail', 'wombat'];
    await renderPage();

    await openEnvironments();
    expect(
      await screen.findByRole('option', { name: 'wombat' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
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

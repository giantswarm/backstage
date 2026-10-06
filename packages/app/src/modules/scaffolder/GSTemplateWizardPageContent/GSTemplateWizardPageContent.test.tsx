import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  scaffolderApiRef,
  SecretsContextProvider,
} from '@backstage/plugin-scaffolder-react';
import { GSTemplateWizardPageContent } from './GSTemplateWizardPageContent';

const mockRefreshSecrets = jest.fn();
const mockNavigate = jest.fn();
const formState = { name: 'my-app' };

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useRefreshTemplateSecrets: () => mockRefreshSecrets,
}));

jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  isSessionExpiredError: (error: { name?: string; reason?: string }) =>
    error?.name === 'ClusterTokenError' && error.reason === 'session-expired',
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => (params?: { taskId: string }) =>
    params ? `/create/tasks/${params.taskId}` : '/create',
  useRouteRefParams: () => ({ namespace: 'default', templateName: 'app' }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@backstage/plugin-scaffolder-react/alpha', () => ({
  ...jest.requireActual('@backstage/plugin-scaffolder-react/alpha'),
  Workflow: (props: { onCreate: (values: object) => Promise<void> }) => (
    <button onClick={() => props.onCreate(formState)}>Create</button>
  ),
}));

const scaffolderApi = { scaffold: jest.fn() };

async function renderWizard() {
  await renderInTestApp(
    <TestApiProvider apis={[[scaffolderApiRef, scaffolderApi]]}>
      <SecretsContextProvider>
        <GSTemplateWizardPageContent extensions={[]} />
      </SecretsContextProvider>
    </TestApiProvider>,
  );
}

function sessionExpired() {
  return Object.assign(new Error('Your session expired.'), {
    name: 'ClusterTokenError',
    reason: 'session-expired',
  });
}

describe('GSTemplateWizardPageContent', () => {
  beforeEach(() => {
    mockRefreshSecrets.mockReset();
    mockNavigate.mockReset();
    scaffolderApi.scaffold.mockReset();
  });

  it('submits freshly minted secrets and opens the task', async () => {
    mockRefreshSecrets.mockResolvedValue({ USER_OIDC_TOKEN: 'fresh' });
    scaffolderApi.scaffold.mockResolvedValue({ taskId: 'task-1' });
    await renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/create/tasks/task-1'),
    );
    expect(scaffolderApi.scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/app',
      values: formState,
      secrets: { USER_OIDC_TOKEN: 'fresh' },
    });
  });

  it('asks to sign in again when the session expired, then retries with the same entries', async () => {
    mockRefreshSecrets
      .mockRejectedValueOnce(sessionExpired())
      .mockResolvedValueOnce({ USER_OIDC_TOKEN: 'fresh' });
    scaffolderApi.scaffold.mockResolvedValue({ taskId: 'task-1' });
    await renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your sign-in expired');
    expect(alert).toHaveFocus();
    expect(scaffolderApi.scaffold).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in and create' }),
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/create/tasks/task-1'),
    );
    expect(scaffolderApi.scaffold).toHaveBeenCalledWith(
      expect.objectContaining({ values: formState }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports any other failure with a retry', async () => {
    mockRefreshSecrets.mockResolvedValue({});
    scaffolderApi.scaffold.mockRejectedValue(
      new Error('Backend request failed, 500 Internal Server Error'),
    );
    await renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't start the template");
    expect(alert).toHaveTextContent(
      'Backend request failed, 500 Internal Server Error',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

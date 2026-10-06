import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { GSTemplateWizardPageContent } from './GSTemplateWizardPageContent';

const mockStart = jest.fn();
const mockNavigate = jest.fn();
let mockFormState: Record<string, string> = { name: 'my-app' };

jest.mock('@giantswarm/backstage-plugin-gs', () => {
  const { useCallback, useState } = jest.requireActual('react');
  return {
    useStartTemplateTask: () => {
      const [state, setState] = useState({ isPending: false });
      const mutateAsync = useCallback(async (values: object) => {
        setState({ isPending: true });
        try {
          const response = await mockStart(values);
          setState({ isPending: false });
          return response;
        } catch (error) {
          setState({ isPending: false, error });
          throw error;
        }
      }, []);
      return { ...state, mutateAsync };
    },
  };
});

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
  useTemplateParameterSchema: () => ({
    loading: false,
    manifest: { title: 'App', steps: [] },
  }),
  useFilteredSchemaProperties: (manifest: object) => manifest,
  Stepper: (props: { onCreate: (values: object) => Promise<void> }) => (
    <button onClick={() => props.onCreate(mockFormState)}>Create</button>
  ),
}));

async function renderWizard() {
  await renderInTestApp(<GSTemplateWizardPageContent extensions={[]} />);
}

function sessionExpired() {
  return Object.assign(new Error('Your session expired.'), {
    name: 'ClusterTokenError',
    reason: 'session-expired',
  });
}

describe('GSTemplateWizardPageContent', () => {
  beforeEach(() => {
    mockStart.mockReset();
    mockNavigate.mockReset();
    mockFormState = { name: 'my-app' };
  });

  it('starts the task with the entries and opens it', async () => {
    mockStart.mockResolvedValue({ taskId: 'task-1' });
    await renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/create/tasks/task-1'),
    );
    expect(mockStart).toHaveBeenCalledWith({ name: 'my-app' });
  });

  it.each([
    ['the portal session expired', sessionExpired()],
    [
      'a Login Required prompt was declined',
      Object.assign(new Error('Login failed, rejected by user'), {
        name: 'RejectedError',
      }),
    ],
    ['the login popup was closed', new Error('Login failed, popup was closed')],
  ])(
    'asks to sign in again when %s, and Create submits the current entries',
    async (_, error) => {
      mockStart
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ taskId: 'task-1' });
      await renderWizard();

      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Your sign-in expired');
      expect(alert).toHaveTextContent('Select Create to sign in again');
      expect(alert).toHaveFocus();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();

      mockFormState = { name: 'renamed-app' };
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/create/tasks/task-1'),
      );
      expect(mockStart).toHaveBeenLastCalledWith({ name: 'renamed-app' });
    },
  );

  it('reports any other failure with its details', async () => {
    mockStart.mockRejectedValue(
      new Error('Backend request failed, 500 Internal Server Error'),
    );
    await renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't start the template");
    expect(alert).toHaveTextContent('Select Create to try again');
    expect(alert).toHaveTextContent(
      'Backend request failed, 500 Internal Server Error',
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

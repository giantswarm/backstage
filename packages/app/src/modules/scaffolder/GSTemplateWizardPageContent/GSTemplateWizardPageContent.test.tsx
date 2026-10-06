import { useState, type ComponentType } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { ReviewStepProps } from '@backstage/plugin-scaffolder-react';
import { TemplateSignInError } from '@giantswarm/backstage-plugin-gs';
import { GSTemplateWizardPageContent } from './GSTemplateWizardPageContent';

const mockStart = jest.fn();
const mockNavigate = jest.fn();
let mockFormState: Record<string, string> = { name: 'my-app' };
let mockTemplateName = 'app';

jest.mock('@giantswarm/backstage-plugin-gs', () => {
  const react = jest.requireActual('react');
  class MockTemplateSignInError extends Error {
    constructor(
      readonly reason: 'session-expired' | 'declined',
      readonly installations: string[],
      readonly cause?: unknown,
    ) {
      super('sign-in did not complete');
      this.name = 'TemplateSignInError';
    }
  }
  return {
    TemplateSignInError: MockTemplateSignInError,
    useStartTemplateTask: () => {
      const [state, setState] = react.useState({
        isPending: false,
        error: null,
      });
      const mutateAsync = react.useCallback(async (values: object) => {
        setState({ isPending: true, error: null });
        try {
          const response = await mockStart(values);
          setState({ isPending: false, error: null });
          return response;
        } catch (error) {
          setState({ isPending: false, error });
          throw error;
        }
      }, []);
      const reset = react.useCallback(
        () => setState({ isPending: false, error: null }),
        [],
      );
      return { ...state, mutateAsync, reset };
    },
  };
});

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => (params?: { taskId: string }) =>
    params ? `/create/tasks/${params.taskId}` : '/create',
  useRouteRefParams: () => ({
    namespace: 'default',
    templateName: mockTemplateName,
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@backstage/plugin-scaffolder-react/alpha', () => {
  const react = jest.requireActual('react');
  return {
    ...jest.requireActual('@backstage/plugin-scaffolder-react/alpha'),
    useTemplateParameterSchema: () => ({
      loading: false,
      manifest: { title: 'App', steps: [] },
    }),
    useFilteredSchemaProperties: (manifest: object) => manifest,
    // Upstream passes only `disableButtons: isValidating` to a custom review
    // step and calls `onCreate` on every click.
    Stepper: (props: {
      onCreate: (values: object) => Promise<void>;
      components: { ReviewStepComponent: ComponentType<ReviewStepProps> };
    }) => {
      const [reviewing, setReviewing] = react.useState(true);
      const { ReviewStepComponent } = props.components;
      return reviewing ? (
        <ReviewStepComponent
          disableButtons={false}
          formData={mockFormState}
          steps={[]}
          handleBack={() => setReviewing(false)}
          handleReset={() => {}}
          handleCreate={() => {
            props.onCreate(mockFormState);
          }}
        />
      ) : (
        <button onClick={() => setReviewing(true)}>Review</button>
      );
    },
  };
});

function TestReviewStep(props: ReviewStepProps) {
  return (
    <>
      <button onClick={props.handleBack}>Back</button>
      <button disabled={props.disableButtons} onClick={props.handleCreate}>
        Create
      </button>
      {/* Two clicks that land before the re-render that disables Create. */}
      <button
        onClick={() => {
          props.handleCreate();
          props.handleCreate();
        }}
      >
        Create twice
      </button>
    </>
  );
}

function WizardWithTemplateLink() {
  const [, setTemplate] = useState(mockTemplateName);
  return (
    <>
      <button
        onClick={() => {
          mockTemplateName = 'other-app';
          setTemplate(mockTemplateName);
        }}
      >
        Open another template
      </button>
      <GSTemplateWizardPageContent
        extensions={[]}
        components={{ ReviewStepComponent: TestReviewStep }}
      />
    </>
  );
}

async function renderWizard() {
  await renderInTestApp(<WizardWithTemplateLink />);
}

const createButton = () => screen.getByRole('button', { name: 'Create' });

describe('GSTemplateWizardPageContent', () => {
  beforeEach(() => {
    mockStart.mockReset();
    mockNavigate.mockReset();
    mockFormState = { name: 'my-app' };
    mockTemplateName = 'app';
  });

  it('starts the task with the entries and opens it', async () => {
    mockStart.mockResolvedValue({ taskId: 'task-1' });
    await renderWizard();

    await userEvent.click(createButton());

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/create/tasks/task-1'),
    );
    expect(mockStart).toHaveBeenCalledWith({ name: 'my-app' });
  });

  it('starts one task for two quick clicks and disables Create meanwhile', async () => {
    let finish: (value: { taskId: string }) => void = () => {};
    mockStart.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      }),
    );
    await renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Create twice' }));

    expect(mockStart).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(createButton()).toBeDisabled());

    finish({ taskId: 'task-1' });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/create/tasks/task-1'),
    );
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('asks to sign in again when the portal session expired, and Create submits the current entries', async () => {
    mockStart
      .mockRejectedValueOnce(
        new TemplateSignInError('session-expired', ['golem'], undefined),
      )
      .mockResolvedValueOnce({ taskId: 'task-1' });
    await renderWizard();

    await userEvent.click(createButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your sign-in expired');
    expect(alert).toHaveTextContent('Select Create to sign in again');
    expect(alert).toHaveFocus();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockFormState = { name: 'renamed-app' };
    await userEvent.click(createButton());

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/create/tasks/task-1'),
    );
    expect(mockStart).toHaveBeenLastCalledWith({ name: 'renamed-app' });
  });

  it('names the installations when a sign-in was declined, without calling it expired', async () => {
    mockStart.mockRejectedValue(
      new TemplateSignInError('declined', ['golem', 'gazelle'], undefined),
    );
    await renderWizard();

    await userEvent.click(createButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign-in needed');
    expect(alert).toHaveTextContent('sign in to golem, gazelle');
    expect(alert).not.toHaveTextContent('expired');
  });

  it('reports any other failure with its details', async () => {
    mockStart.mockRejectedValue(
      new Error('Backend request failed, 500 Internal Server Error'),
    );
    await renderWizard();

    await userEvent.click(createButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't start the template");
    expect(alert).toHaveTextContent('Select Create to try again');
    expect(alert).toHaveTextContent(
      'Backend request failed, 500 Internal Server Error',
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("drops a failed Create's alert when the person leaves the review step", async () => {
    mockStart.mockRejectedValue(new Error('500'));
    await renderWizard();

    await userEvent.click(createButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("drops a failed Create's alert when another template opens", async () => {
    mockStart.mockRejectedValue(new Error('500'));
    await renderWizard();

    await userEvent.click(createButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Open another template' }),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

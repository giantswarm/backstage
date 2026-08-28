import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { musterApiRef } from '../../apis';
import { MusterWorkflow } from '../../lib/k8s';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { WorkflowMutationActions } from './WorkflowMutationActions';

// The ad-hoc dialog embeds the CodeMirror-backed YamlEditorFormField, which
// does not render under jsdom; the dialog's Save reads the seeded React state,
// not the editor DOM, so a plain textarea is behaviorally equivalent here.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  YamlEditorFormField: ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      aria-label={label}
      value={value}
      onChange={e => onChange?.(e.target.value)}
    />
  ),
}));

function makeWorkflow(options: {
  /** Marks the CR GitOps-managed (Helm provenance label). */
  managed?: boolean;
}): MusterWorkflow {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: 'deploy',
        namespace: 'agent-platform',
        ...(options.managed
          ? { labels: { 'app.kubernetes.io/managed-by': 'Helm' } }
          : {}),
      },
      spec: {
        description: 'Deploys things',
        args: { cluster: { type: 'string', required: true } },
        steps: [{ id: 's1', tool: 'core_service_list', args: {} }],
      },
    } as never,
    'gazelle',
  );
}

/** Minimal provider value for tests that assert the post-mutation refresh. */
function makeInstance(retry: () => void): MusterInstance {
  return {
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    activeInstallationInfo: undefined,
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    workflows: [],
    isLoading: false,
    dataUpdatedAt: undefined,
    isRefreshing: false,
    retry,
  };
}

async function renderActions(
  workflow: MusterWorkflow,
  options: {
    /** Provider retry spy; when set, the render is wrapped in the instance context. */
    retry?: () => void;
    callTool?: jest.Mock;
  } = {},
) {
  const musterApi = {
    callTool: options.callTool ?? jest.fn(),
    getAuthStatus: jest.fn(() => Promise.resolve({ servers: [] })),
    signInServer: jest.fn(),
    signOutServer: jest.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const actions = <WorkflowMutationActions workflow={workflow} />;
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        {options.retry ? (
          <MusterInstanceContext.Provider value={makeInstance(options.retry)}>
            {actions}
          </MusterInstanceContext.Provider>
        ) : (
          actions
        )}
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

/**
 * A muster mutation writes the CR synchronously, so the UI must refetch the
 * CRD reads right after a successful call instead of waiting for the next
 * background poll (up to 30s, longer in an unfocused tab where react-query
 * pauses `refetchInterval`). Unlike the servers page, the workflow list has
 * no runtime aggregator query: the provider's CRD reads (covered by `retry`)
 * are the whole read path. Mirrors the ServerMutationActions coverage.
 */
describe('WorkflowMutationActions post-mutation refresh', () => {
  it('refetches the CRD reads after a successful delete confirm', async () => {
    const retry = jest.fn();
    await renderActions(makeWorkflow({}), { retry });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // Two "Delete" buttons exist now (row + dialog confirm); scope to the dialog.
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    );

    expect(
      await screen.findByText(/Done\. The workflow list has been refreshed/),
    ).toBeInTheDocument();
    expect(retry).toHaveBeenCalled();
  });

  it('does not refetch when the mutation fails', async () => {
    const retry = jest.fn();
    await renderActions(makeWorkflow({}), {
      retry,
      callTool: jest.fn(() => Promise.reject(new Error('boom'))),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    );

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(retry).not.toHaveBeenCalled();
  });

  it('refetches after saving an ad-hoc workflow definition', async () => {
    const retry = jest.fn();
    await renderActions(makeWorkflow({}), { retry });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/Saved\. The workflow list has been refreshed/),
    ).toBeInTheDocument();
    expect(retry).toHaveBeenCalled();
  });
});

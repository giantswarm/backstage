import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type { AgentDeletionState } from '../../hooks/useAgentDeletion';
import type { CommitAgentResult } from '../../lib/agentManager';
import { committedTo } from '../../lib/__fixtures__/gitOpsCommit';
import { AgentDeleteDialog } from './AgentDeleteDialog';

// agent-manager's answers to the empty commit dry run, as they come over MCP
// (see `missingReleaseFile`'s test for the first).
const MISSING_RELEASE_FILE =
  "conflict: conflict: HelmRelease flux-giantswarm/pr-reviewer is not in agent-manager's directory management-clusters/gazelle/extras/agent-manager of giantswarm/giantswarm-management-clusters (no management-clusters/gazelle/extras/agent-manager/pr-reviewer.yaml there): change it in the file that defines it";
const AUTH_REQUIRED =
  'auth_required: commit mode opens the pull request with your GitHub authorization, and this call carries none: connect agent-manager in muster (core_auth_login server=agent-manager), then call again';

const DELETION: AgentDeletionState = {
  deleteAgent: jest.fn(),
  isDeleting: false,
  commit: jest.fn(),
  isCommitting: false,
  failure: undefined,
  reset: jest.fn(),
};

const onConfirm = jest.fn();
const onCommit = jest.fn();

type Scenario = {
  mode: 'apply' | 'commit';
  /** What the commit dry run fails with; it passes otherwise. */
  dryRunError?: string;
  /** The dry run never answers. */
  dryRunPending?: boolean;
  commitResult?: CommitAgentResult;
  deletion?: Partial<AgentDeletionState>;
};

function makeMusterApi(scenario: Scenario) {
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      if (name !== 'x_agent-manager_update_agent' || !args.dryRun) {
        throw new Error(`unexpected tool ${name}`);
      }
      if (scenario.dryRunPending) {
        return new Promise(() => {});
      }
      if (scenario.dryRunError) {
        throw new Error(scenario.dryRunError);
      }
      return { ...committedTo(), dryRun: true, after: {} };
    },
  );
  const getAuthStatus = jest.fn(async () => ({ servers: [] }));
  return {
    api: { callTool, getAuthStatus } as unknown as MusterApi,
    callTool,
  };
}

async function renderDialog(scenario: Scenario) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <AgentDeleteDialog
          installation="gazelle"
          namespace="kagent"
          name="pr-reviewer"
          displayName="PR reviewer"
          isOpen
          onOpenChange={jest.fn()}
          deletion={{ ...DELETION, ...scenario.deletion }}
          mode={scenario.mode}
          onConfirm={onConfirm}
          onCommit={onCommit}
          commitResult={scenario.commitResult}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

beforeEach(() => {
  onConfirm.mockReset();
  onCommit.mockReset();
});

describe('AgentDeleteDialog', () => {
  it('deletes an agent written live, with no pull request on offer and nothing asked first', async () => {
    // A pull request goes to the GitOps repository that owns the release; an
    // agent written live has none, so there are no files for it to remove.
    const { callTool } = await renderDialog({ mode: 'apply' });

    expect(screen.queryByText(/pull request/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Commit|pull request/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete agent' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
  });

  it('deletes an agent applied from git through a pull request once agent-manager says it can open one', async () => {
    const { callTool } = await renderDialog({ mode: 'commit' });

    expect(
      screen.getByText(
        /applied from GitOps, so agent-manager opens a pull request/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete agent' }),
    ).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Open pull request' });
    await waitFor(() => expect(confirm).toBeEnabled());
    // The empty commit dry run: nothing to change, nothing written.
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_update_agent',
      {
        namespace: 'kagent',
        name: 'pr-reviewer',
        mode: 'commit',
        dryRun: true,
      },
      'gazelle',
    );

    await userEvent.click(confirm);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('holds confirm while agent-manager is asked', async () => {
    await renderDialog({ mode: 'commit', dryRunPending: true });

    expect(
      await screen.findByText(
        'Asking agent-manager whether it can open the pull request…',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open pull request' }),
    ).toBeDisabled();
  });

  it('explains an agent defined outside agent-manager’s directory, with only Close to press', async () => {
    await renderDialog({ mode: 'commit', dryRunError: MISSING_RELEASE_FILE });

    expect(
      await screen.findByText('This agent cannot be deleted here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /defined in Git outside the directory the portal writes to/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /^giantswarm\/giantswarm-management-clusters/,
      }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/giantswarm-management-clusters',
    );
    expect(
      screen.getByRole('link', {
        name: /^management-clusters\/gazelle\/extras/,
      }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/giantswarm-management-clusters/tree/HEAD/management-clusters/gazelle/extras',
    );
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    // agent-manager's own words, folded away.
    await userEvent.click(
      screen.getByRole('button', { name: 'Technical details' }),
    );
    expect(
      await screen.findByText(/is not in agent-manager's directory/),
    ).toBeVisible();
  });

  it('asks for the GitHub authorization before confirm', async () => {
    await renderDialog({ mode: 'commit', dryRunError: AUTH_REQUIRED });

    expect(
      await screen.findByText('Authorize GitHub for agent-manager'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/with your GitHub authorization, and this call/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open pull request' }),
    ).toBeDisabled();
  });

  it('leaves confirm to the delete when the check fails some other way', async () => {
    await renderDialog({
      mode: 'commit',
      dryRunError: 'backend_error: GitHub answered 502',
    });

    const confirm = screen.getByRole('button', { name: 'Open pull request' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(screen.queryByText(/GitHub answered 502/)).not.toBeInTheDocument();
  });

  it('links the pull request once it is open, with nothing left to confirm', async () => {
    await renderDialog({
      mode: 'commit',
      commitResult: committedTo('https://github.com/giantswarm/agents/pull/7'),
    });

    expect(
      screen.getByRole('link', { name: /Review pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/agents/pull/7');
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the button for another try after the delete asked for the GitHub authorization', async () => {
    // The check passed, and the authorization went away before confirm.
    await renderDialog({
      mode: 'commit',
      deletion: {
        failure: {
          kind: 'refused',
          code: 'auth_required',
          message: 'sign in to GitHub through muster first',
        },
      },
    });

    expect(
      screen.getByText('Authorize GitHub for agent-manager'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('sign in to GitHub through muster first'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open pull request' }),
      ).toBeEnabled(),
    );
  });

  it('explains a delete refused for a release outside agent-manager’s directory', async () => {
    // The check passed; the repository changed before confirm.
    await renderDialog({
      mode: 'commit',
      deletion: {
        failure: {
          kind: 'refused',
          code: 'conflict',
          message: MISSING_RELEASE_FILE.replace(/^conflict: /, ''),
        },
      },
    });

    expect(
      screen.getByText('This agent cannot be deleted here'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });
});

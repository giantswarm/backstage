import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentDeletionState } from '../../hooks/useAgentDeletion';
import type { CommitAgentResult } from '../../lib/agentManager';
import { committedTo } from '../../lib/__fixtures__/gitOpsCommit';
import { AgentDeleteDialog } from './AgentDeleteDialog';

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

const renderDialog = (
  mode: 'apply' | 'commit',
  commitResult?: CommitAgentResult,
) =>
  renderInTestApp(
    <AgentDeleteDialog
      installation="gazelle"
      displayName="PR reviewer"
      isOpen
      onOpenChange={jest.fn()}
      deletion={DELETION}
      mode={mode}
      onConfirm={onConfirm}
      onCommit={onCommit}
      commitResult={commitResult}
    />,
  );

beforeEach(() => {
  onConfirm.mockReset();
  onCommit.mockReset();
});

describe('AgentDeleteDialog', () => {
  it('deletes an agent written live, with no pull request on offer', async () => {
    // A pull request goes to the GitOps repository that owns the release; an
    // agent written live has none, so there are no files for it to remove.
    await renderDialog('apply');

    expect(screen.queryByText(/pull request/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Commit|pull request/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete agent' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('deletes an agent applied from git through a pull request only', async () => {
    await renderDialog('commit');

    expect(
      screen.getByText(/applied from its GitOps repository/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete agent' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Open pull request' }),
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('links the pull request once it is open, with nothing left to confirm', async () => {
    await renderDialog(
      'commit',
      committedTo('https://github.com/giantswarm/agents/pull/7'),
    );

    expect(
      screen.getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/agents/pull/7');
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the button for another try after the connect step', async () => {
    // agent-manager refuses a commit without the person's GitHub
    // authorization with `auth_required`: a refusal, shown as the error.
    await renderInTestApp(
      <AgentDeleteDialog
        installation="gazelle"
        displayName="PR reviewer"
        isOpen
        onOpenChange={jest.fn()}
        deletion={{
          ...DELETION,
          failure: {
            kind: 'refused',
            code: 'auth_required',
            message: 'sign in to GitHub through muster first',
          },
        }}
        mode="commit"
        onConfirm={onConfirm}
        onCommit={onCommit}
      />,
    );

    expect(
      screen.getByText('sign in to GitHub through muster first'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open pull request' }),
    ).toBeInTheDocument();
  });
});

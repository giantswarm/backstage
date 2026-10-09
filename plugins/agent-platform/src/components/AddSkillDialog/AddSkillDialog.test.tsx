import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { SkillPullRequest } from '../../hooks/useProposeSkill';
import { AddSkillDialog } from './AddSkillDialog';

const REPO = 'https://github.com/giantswarm/skills';

const proposeSkill = jest.fn();
let mockState: {
  isProposing: boolean;
  error: Error | null;
  result?: SkillPullRequest;
};
jest.mock('../../hooks/useProposeSkill', () => ({
  ...jest.requireActual('../../hooks/useProposeSkill'),
  useProposeSkill: () => ({
    proposeSkill,
    reset: jest.fn(),
    ...mockState,
  }),
}));

const opened: SkillPullRequest = {
  pullRequestUrl: 'https://github.com/giantswarm/skills/pull/7',
  number: 7,
  branch: 'add-skill/notes',
  base: 'main',
  path: 'notes/SKILL.md',
};

function renderDialog(repositories = [REPO]) {
  return renderInTestApp(
    <AddSkillDialog
      repositories={repositories}
      isOpen
      onOpenChange={() => {}}
    />,
  );
}

beforeEach(() => {
  proposeSkill.mockReset();
  proposeSkill.mockResolvedValue(opened);
  mockState = { isProposing: false, error: null };
});

describe('AddSkillDialog', () => {
  // Typing three fields with userEvent outruns the 5s default under a loaded
  // parallel run, hence the explicit timeouts.
  it('proposes the skill to the configured repository', async () => {
    const user = userEvent.setup();
    await renderDialog();

    expect(
      screen.getByText('Repository: giantswarm/skills'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Name/), 'notes');
    await user.type(screen.getByLabelText(/Description/), 'Take notes.');
    await user.type(screen.getByLabelText(/Instructions/), 'Write it down.');
    await user.click(screen.getByRole('button', { name: 'Open pull request' }));

    expect(proposeSkill).toHaveBeenCalledWith({
      repoUrl: REPO,
      skillName: 'notes',
      description: 'Take notes.',
      instructions: 'Write it down.',
    });
  }, 30_000);

  it('refuses to submit while the form is incomplete', async () => {
    const user = userEvent.setup();
    await renderDialog();

    await user.type(screen.getByLabelText(/Name/), 'notes');
    await user.click(screen.getByRole('button', { name: 'Open pull request' }));

    expect(proposeSkill).not.toHaveBeenCalled();
  }, 30_000);

  it('shows the opened pull request and what happens next', async () => {
    mockState = { isProposing: false, error: null, result: opened };
    await renderDialog();

    expect(screen.getByText('Pull request #7 opened')).toBeInTheDocument();
    expect(
      screen.getByText(/A teammate reviews and approves it/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', opened.pullRequestUrl);
    // Two Close buttons: the dialog's own X and the footer's. Cancel is gone.
    expect(
      screen.getAllByRole('button', { name: 'Close' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).not.toBeInTheDocument();
  });

  it('shows the backend’s reason when the pull request could not be opened', async () => {
    mockState = {
      isProposing: false,
      error: new Error(
        'A skill named notes already exists in giantswarm/skills.',
      ),
    };
    await renderDialog();

    expect(
      screen.getByText('Could not open the pull request'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A skill named notes already exists in giantswarm/skills.',
      ),
    ).toBeInTheDocument();
  });
});

import { ReactNode, useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { agentsRouteRef } from '../../routes';
import type { DiscoveredSkill } from '../../lib/skills';
import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { NewAgentSkillsPage } from './NewAgentSkillsPage';

// Header actions land in the shared plugin header, outside this tree; the page
// renders the same actions in its footer card.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: jest.fn(),
}));

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const OTHER = '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b';

const SKILLS: DiscoveredSkill[] = [
  {
    name: 'Incident responder',
    description: 'Triage an incident.',
    repoUrl: 'https://github.com/giantswarm/agent-skills',
    path: 'incident',
    ref: 'main',
    commit: HEAD,
  },
  {
    name: 'PR review',
    description: 'Review pull requests.',
    repoUrl: 'https://github.com/giantswarm/claude-code',
    path: 'plugins/gs-base/skills/pr-review',
    ref: 'master',
    commit: OTHER,
  },
];

jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    skills: SKILLS,
    isLoading: false,
    error: null,
    hasRepositories: true,
    failedRepositories: [],
    truncated: false,
  }),
}));

/** Fills the step-1 fields the skills step requires, then renders its child. */
function Seed({ children }: { children: ReactNode }) {
  const { setName, setInstallation, selectModelConfig, isComplete } =
    useNewAgentForm();
  useEffect(() => {
    setName('Reviewer');
    setInstallation('gazelle');
    selectModelConfig('opus', 'kagent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return isComplete ? <>{children}</> : null;
}

/** Exposes the selected skills' pins for assertions on the step's output. */
function SelectionProbe() {
  const { state } = useNewAgentForm();
  return (
    <output data-testid="selection">
      {state.selectedSkills
        .map(skill => `${skill.path}@${skill.commit}`)
        .join(' | ')}
    </output>
  );
}

async function renderStep() {
  return renderInTestApp(
    <NewAgentFormProvider>
      <Seed>
        <NewAgentSkillsPage />
        <SelectionProbe />
      </Seed>
    </NewAgentFormProvider>,
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
}

describe('NewAgentSkillsPage', () => {
  it('shows the commit each skill is pinned to, next to its branch', async () => {
    await renderStep();

    const incident = await screen.findByRole('checkbox', {
      name: 'Skill Incident responder',
    });
    expect(incident).toHaveTextContent('main @cb1fb76');
    expect(
      screen.getByLabelText('Pinned to commit cb1fb76 of main'),
    ).toBeInTheDocument();

    const review = screen.getByRole('checkbox', { name: 'Skill PR review' });
    expect(review).toHaveTextContent('master @9f2c1a7');
  });

  it('carries the full commit into the form model when a skill is picked', async () => {
    const user = userEvent.setup();
    await renderStep();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Skill Incident responder' }),
    );

    expect(screen.getByTestId('selection')).toHaveTextContent(
      `incident@${HEAD}`,
    );
    // A branch name is never what is selected.
    expect(screen.getByTestId('selection')).not.toHaveTextContent('main');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('says that skills stay on their pinned commit', async () => {
    await renderStep();
    expect(
      await screen.findByText(/pinned to the commit shown on its card/),
    ).toBeInTheDocument();
  });
});

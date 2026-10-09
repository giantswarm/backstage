import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentRow } from '../AgentsDataProvider';
import { RecentAgentChips } from './RecentAgentChips';

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

function agent(name: string): AgentRow {
  return {
    id: `gazelle/kagent/${name}`,
    installation: 'gazelle',
    namespace: 'kagent',
    name,
    technicalName: name.toLowerCase().replace(/\s+/g, '-'),
    description: '',
    skillCount: 0,
    readiness: 'ready',
  };
}

describe('RecentAgentChips', () => {
  it('offers the agents in the order given', () => {
    render(
      <RecentAgentChips
        agents={[agent('Support Triage'), agent('Research'), agent('SRE')]}
        onPick={jest.fn()}
      />,
    );

    const group = screen.getByRole('group', {
      name: 'Or pick one of your recent agents',
    });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName('Support Triage');
    expect(buttons[1]).toHaveAccessibleName('Research');
    expect(buttons[2]).toHaveAccessibleName('SRE');
  });

  it('picks the pressed agent', async () => {
    const onPick = jest.fn();
    const research = agent('Research');
    render(
      <RecentAgentChips agents={[agent('SRE'), research]} onPick={onPick} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Research' }));

    expect(onPick).toHaveBeenCalledWith(research);
  });

  it('renders nothing without recent agents', () => {
    const { container } = render(
      <RecentAgentChips agents={[]} onPick={jest.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentRow } from '../AgentsDataProvider';
import { NewSessionDialog } from './NewSessionDialog';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

const onStart = jest.fn();
const onOpenChange = jest.fn();

const sre: AgentRow = {
  id: 'gazelle/kagent/sre-agent',
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'SRE Agent',
  technicalName: 'sre-agent',
  description: 'Investigates incidents',
  skillCount: 3,
  readiness: 'ready',
};

function renderDialog(
  props: Partial<Parameters<typeof NewSessionDialog>[0]> = {},
) {
  return render(
    <NewSessionDialog
      isOpen
      onOpenChange={onOpenChange}
      agents={[sre]}
      defaultAgent={sre}
      isStarting={false}
      onStart={onStart}
      {...props}
    />,
  );
}

beforeEach(() => {
  onStart.mockReset();
  onOpenChange.mockReset();
});

describe('NewSessionDialog', () => {
  it('opens expanded, with the agent preselected and the prompt focused', () => {
    // Always expanded, unlike the inline placement: opening the dialog is already
    // the deliberate act that focusing would otherwise interrupt.
    renderDialog();

    expect(screen.getByText('New session')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agent/ })).toHaveTextContent(
      'SRE Agent',
    );
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveFocus();
  });

  it('stays open after submitting, since the create can fail', async () => {
    // Closing here would throw away the only place left to report a failure — and
    // the only place the prompt still exists.
    renderDialog();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Prompt' }),
      'why is the ingress failing?',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(onStart).toHaveBeenCalledWith(sre, 'why is the ingress failing?');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('cannot be closed by the header’s own X while a create is in flight', async () => {
    // `isDismissable`/`isKeyboardDismissDisabled` reach the outside click and
    // Escape, but not the close button bui's DialogHeader always renders. Closing
    // there mid-flight would orphan a write already on its way to kagent, with
    // nowhere left to report a failure.
    renderDialog({ isStarting: true });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('can be closed by the header’s X when nothing is in flight', async () => {
    // The other half: the guard must not make the dialog permanently sticky.
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a failed create', () => {
    renderDialog({ error: 'kagent did not accept the agent' });

    expect(screen.getByText('Session not started')).toBeInTheDocument();
  });
});

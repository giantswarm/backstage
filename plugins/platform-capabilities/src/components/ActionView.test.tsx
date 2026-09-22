import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import { Action, ActionStateName } from '../apis';
import {
  AGENT_PLATFORM_DEFINITION,
  DENIED_ACTION,
  installation,
  REFUSED_ACTION,
  REMOVED_ACTION,
} from '../fixtures/fakeApi';
import { ACTION_STATE_WORDS } from './ActionStateTag';
import { ActionView } from './ActionView';

const FILE = 'installations/rowan/config.yaml.patch';
const FILE_URL = `https://github.com/example/example-configs/blob/HEAD/${FILE}`;

async function render(action: Action) {
  await renderInTestApp(
    <ActionView
      action={action}
      installation={installation()}
      definition={AGENT_PLATFORM_DEFINITION}
    />,
  );
  return screen.getByTestId(`action-${action.name}`);
}

describe('ActionView', () => {
  it('a refused action: its line, what it asked for, and the file and repository the refusal names, linked', async () => {
    const record = await render(REFUSED_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^enable agent-platform by someone · Refused · .+ ago$/,
    );
    expect(screen.getByTestId('action-state')).toHaveAttribute(
      'data-state',
      'refused',
    );
    const asked = within(record).getByTestId('action-inputs');
    expect(
      within(asked)
        .getAllByRole('term')
        .map(t => t.textContent),
    ).toEqual(['Chart line', 'Kagent', 'Portal']);
    expect(
      within(asked)
        .getAllByRole('definition')
        .map(d => d.textContent),
    ).toEqual(['3', 'on', 'off']);
    const result = within(record).getByTestId('action-result');
    expect(within(result).getByRole('link', { name: FILE })).toHaveAttribute(
      'href',
      FILE_URL,
    );
    expect(
      within(result).getByRole('link', { name: 'example/example-configs' }),
    ).toHaveAttribute('href', 'https://github.com/example/example-configs');
    expect(record).not.toHaveTextContent(/unknown|reconcile/i);
  });

  it('a denied action reads Withdrawn, with the decision and the closed pull request', async () => {
    const record = await render(DENIED_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^apply changes to agent-platform by someone · Withdrawn · /,
    );
    expect(screen.getByTestId('action-state')).toHaveAttribute(
      'data-state',
      'denied',
    );
    expect(within(record).getByTestId('action-approval')).toHaveTextContent(
      'Approval: denied by reviewer — not during the freeze (#platform)',
    );
    expect(
      within(record).getByTestId('action-pull-requests'),
    ).toHaveTextContent('example/example-configs#9 — closed');
    expect(within(record).getByTestId('action-result')).toHaveTextContent(
      'denied by reviewer: not during the freeze',
    );
  });

  it('a removed action reads Reverted, its rollout naming the file that left, linked', async () => {
    const record = await render(REMOVED_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^enable agent-platform by someone · Reverted · /,
    );
    expect(screen.getByTestId('action-state')).toHaveAttribute(
      'data-state',
      'removed',
    );
    const rollout = within(record).getByTestId('action-rollout');
    expect(rollout).toHaveTextContent(
      `rowan: removed — ${FILE} is gone from the default branch of example/example-configs again`,
    );
    expect(within(rollout).getByRole('link', { name: FILE })).toHaveAttribute(
      'href',
      FILE_URL,
    );
    expect(
      within(record).getByTestId('action-pull-requests'),
    ).toHaveTextContent('example/example-configs#5 — merged');
  });

  it('has a word of its own for every state an action can be in', () => {
    const states: ActionStateName[] = [
      'pending approval',
      'rolling out',
      'waiting for the customer',
      'enabled',
      'drifted',
      'failed',
      'refused',
      'denied',
      'removed',
    ];
    for (const state of states) {
      expect(ACTION_STATE_WORDS[state]).not.toBe('Unknown');
    }
    expect(ACTION_STATE_WORDS.refused).toBe('Refused');
    expect(ACTION_STATE_WORDS.denied).toBe('Withdrawn');
    expect(ACTION_STATE_WORDS.removed).toBe('Reverted');
  });
});

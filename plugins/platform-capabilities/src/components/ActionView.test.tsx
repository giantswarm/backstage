import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import { Action } from '../apis';
import {
  AGENT_PLATFORM_DEFINITION,
  DENIED_ACTION,
  installation,
  READY_TO_MERGE_ACTION,
  REFUSED_ACTION,
  REMOVED_ACTION,
  REVERTED_ACTION,
  WITHDRAWN_ACTION,
} from '../fixtures/fakeApi';
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

  it('a denied action reads Denied, with the decision and the closed pull request', async () => {
    const record = await render(DENIED_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^apply changes to agent-platform by someone · Denied · /,
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

  it('a removed action reads Removed, its rollout naming the file that left, linked', async () => {
    const record = await render(REMOVED_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^enable agent-platform by someone · Removed · /,
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

  it('a reverted action reads Reverted, not in sync, with the reverting pull request linked', async () => {
    const record = await render(REVERTED_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^enable agent-platform by someone · Reverted · /,
    );
    const tag = screen.getByTestId('action-state');
    expect(tag).toHaveAttribute('data-state', 'reverted');
    expect(tag).toHaveAttribute('data-mark', 'not in sync');
    const pulls = within(record).getByTestId('action-pull-requests');
    expect(pulls).toHaveTextContent(
      'example/example-configs#11 — merged, reverted by #12',
    );
    expect(within(pulls).getByRole('link', { name: '#12' })).toHaveAttribute(
      'href',
      'https://github.com/example/example-configs/pull/12',
    );
    expect(record).not.toHaveTextContent(/unknown/i);
  });

  it('a withdrawn action reads Withdrawn, with who withdrew it and why', async () => {
    const record = await render(WITHDRAWN_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^enable agent-platform by someone · Withdrawn · /,
    );
    expect(screen.getByTestId('action-state')).toHaveAttribute(
      'data-state',
      'withdrawn',
    );
    expect(within(record).getByTestId('action-withdrawal')).toHaveTextContent(
      'Withdrawn by someone — rolled back for the freeze',
    );
    expect(record).not.toHaveTextContent(/unknown/i);
  });

  it('a ready to merge action: its own word, the actor’s merge as the next step, no approval asked', async () => {
    const record = await render(READY_TO_MERGE_ACTION);
    expect(screen.getByTestId('action-line')).toHaveTextContent(
      /^enable agent-platform by someone · Ready to merge · .+ ago$/,
    );
    expect(screen.getByTestId('action-state')).toHaveAttribute(
      'data-state',
      'ready to merge',
    );
    expect(within(record).getByTestId('action-next-step')).toHaveTextContent(
      'No Team review needed: merge the pull requests once their checks are green.',
    );
    expect(within(record).getByTestId('action-approval')).toHaveTextContent(
      'Approval: not required',
    );
    expect(
      within(record).getByRole('link', { name: 'example/example-configs#7' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/example/example-configs/pull/7',
    );
    expect(record).not.toHaveTextContent(/unknown|pending/i);
  });
});

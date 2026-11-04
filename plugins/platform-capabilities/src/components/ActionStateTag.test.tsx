import { render, screen } from '@testing-library/react';
import { ActionStateName } from '../apis';
import { ActionStateTag } from './ActionStateTag';

describe('ActionStateTag', () => {
  it.each<[ActionStateName, string, string | null]>([
    ['refused', 'Refused', null],
    ['denied', 'Denied', null],
    ['reverted', 'Reverted', 'not in sync'],
    ['withdrawn', 'Withdrawn', null],
    ['removed', 'Removed', null],
    ['enabled', 'Installed', 'in sync'],
    ['ready to merge', 'Ready to merge', null],
    ['pending approval', 'Pending approval', 'not reconciled'],
  ])('%s reads %s', (state, words, mark) => {
    render(<ActionStateTag state={state} />);
    const tag = screen.getByTestId('action-state');
    expect(tag).toHaveAttribute('data-state', state);
    expect(tag).toHaveTextContent(words);
    expect(tag).not.toHaveTextContent(/unknown/i);
    expect(tag.getAttribute('data-mark')).toBe(mark);
  });

  it('reads a word of its own for every state an action can be in', () => {
    const states: ActionStateName[] = [
      'pending approval',
      'ready to merge',
      'rolling out',
      'waiting for the customer',
      'enabled',
      'drifted',
      'failed',
      'refused',
      'denied',
      'reverted',
      'withdrawn',
      'removed',
    ];
    const words = states.map(state => {
      const { unmount } = render(<ActionStateTag state={state} />);
      const text = screen.getByTestId('action-state').textContent;
      unmount();
      return text;
    });
    expect(words.join(' ')).not.toMatch(/unknown/i);
    // No two of the action's states look alike.
    expect(new Set(words).size).toBe(states.length);
  });

  it('says on the tooltip that a ready to merge action is the actor’s to merge', () => {
    render(<ActionStateTag state="ready to merge" />);
    expect(screen.getByTestId('action-state')).toHaveAttribute(
      'title',
      'No Team review needed: merge the pull requests once their checks are green.',
    );
  });

  it('carries the record’s detail on the tooltip', async () => {
    render(
      <ActionStateTag
        state="withdrawn"
        detail="Withdrawn by someone: rolled back for the freeze"
      />,
    );
    expect(screen.getByTestId('action-state')).toHaveAttribute(
      'title',
      expect.stringContaining('rolled back for the freeze'),
    );
  });
});

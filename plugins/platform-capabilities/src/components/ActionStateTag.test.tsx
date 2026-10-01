import { render, screen } from '@testing-library/react';
import { ActionStateName } from '../apis';
import { ACTION_STATE_WORDS, ActionStateTag } from './ActionStateTag';

describe('ActionStateTag', () => {
  it.each<[ActionStateName, string, string | null]>([
    ['refused', 'Refused', null],
    ['denied', 'Denied', null],
    ['reverted', 'Reverted', 'not in sync'],
    ['withdrawn', 'Withdrawn', null],
    ['removed', 'Removed', null],
    ['enabled', 'Installed', 'in sync'],
  ])('%s reads %s', (state, words, mark) => {
    render(<ActionStateTag state={state} />);
    const tag = screen.getByTestId('action-state');
    expect(tag).toHaveAttribute('data-state', state);
    expect(tag).toHaveTextContent(words);
    expect(tag).not.toHaveTextContent(/unknown/i);
    expect(tag.getAttribute('data-mark')).toBe(mark);
    expect(ACTION_STATE_WORDS[state]).toBe(words);
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

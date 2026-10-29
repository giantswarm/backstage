import { render, screen } from '@testing-library/react';
import { ActionStateName, CapabilityStateName } from '../apis';
import { CapabilityMark, StateIcon } from './StateIcon';
import { markOf } from './StateTag';

describe('markOf', () => {
  it.each<[CapabilityStateName, ActionStateName | undefined, CapabilityMark]>([
    ['enabled', 'enabled', 'in sync'],
    ['enabled', undefined, 'not reconciled'],
    ['enabled', 'denied', 'not reconciled'],
    ['drifted', 'drifted', 'not in sync'],
    ['pending approval', 'pending approval', 'not reconciled'],
    ['ready to merge', 'ready to merge', 'not reconciled'],
    ['rolling out', 'rolling out', 'not reconciled'],
    ['waiting for the customer', 'waiting for the customer', 'not reconciled'],
    ['not enabled', undefined, 'not installed'],
    ['failed', 'failed', 'failed'],
    ['unknown', undefined, 'unknown'],
  ])('%s with last action %s is %s', (state, result, mark) => {
    const lastAction = result ? { name: 'a', result } : null;
    expect(markOf({ state, lastAction })).toBe(mark);
  });
});

describe('StateIcon', () => {
  it('names the state in the page words and carries the mark', () => {
    render(
      <StateIcon
        capability={{ state: 'enabled', lastAction: null }}
        testId="cell"
      />,
    );
    const cell = screen.getByTestId('cell');
    expect(cell).toHaveAttribute('data-state', 'enabled');
    expect(cell).toHaveAttribute('data-mark', 'not reconciled');
    expect(cell).toHaveAccessibleName('Installed');
    expect(cell).toHaveTextContent('');
  });

  it('names ready to merge as such, apart from pending approval', () => {
    render(
      <StateIcon
        capability={{
          state: 'ready to merge',
          lastAction: { name: 'enable-agent-platform-ash-1' },
        }}
        testId="cell"
      />,
    );
    const cell = screen.getByTestId('cell');
    expect(cell).toHaveAttribute('data-state', 'ready to merge');
    expect(cell).toHaveAccessibleName('Enabling · ready to merge');
  });
});

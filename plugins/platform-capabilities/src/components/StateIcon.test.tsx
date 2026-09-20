import { render, screen } from '@testing-library/react';
import { CapabilityStateName } from '../apis';
import { CapabilityMark, markOf, StateIcon } from './StateIcon';

describe('markOf', () => {
  it.each<[CapabilityStateName, string | undefined, CapabilityMark]>([
    ['enabled', 'enabled', 'in sync'],
    ['enabled', undefined, 'not reconciled'],
    ['enabled', 'denied', 'not reconciled'],
    ['drifted', 'drifted', 'not in sync'],
    ['pending approval', 'pending approval', 'not reconciled'],
    ['rolling out', 'rolling out', 'not reconciled'],
    ['waiting for the customer', 'waiting for the customer', 'not reconciled'],
    ['not enabled', undefined, 'not installed'],
    ['not opted in', undefined, 'not installed'],
    ['failed', 'failed', 'failed'],
    ['unknown', undefined, 'unknown'],
  ])('%s with last action %s is %s', (state, result, mark) => {
    const lastAction = result ? { name: 'a', result } : null;
    expect(markOf({ state, lastAction })).toBe(mark);
  });
});

describe('StateIcon', () => {
  it('names the state in the manager words and carries the mark', () => {
    render(
      <StateIcon
        capability={{ state: 'enabled', lastAction: null }}
        testId="cell"
      />,
    );
    const cell = screen.getByTestId('cell');
    expect(cell).toHaveAttribute('data-state', 'enabled');
    expect(cell).toHaveAttribute('data-mark', 'not reconciled');
    expect(cell).toHaveAccessibleName('enabled · not reconciled yet');
    expect(cell).toHaveTextContent('');
  });
});

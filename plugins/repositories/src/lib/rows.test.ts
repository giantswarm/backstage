import {
  legacyTool,
  newService,
  oldOperator,
  presentService,
  rowOf,
  strayTool,
} from '../fixtures/records';
import { lifecycleOf, setupState } from './rows';

describe('setupState', () => {
  it('names the set-up state of a row', () => {
    expect(setupState(rowOf(presentService))).toBe('converged');
    expect(setupState(rowOf(newService))).toBe('not converged');
    expect(setupState(rowOf(strayTool))).toBe('unchecked');
  });
});

describe('lifecycleOf', () => {
  it('reads the declared lifecycle, else active', () => {
    expect(lifecycleOf(rowOf(presentService))).toBe('active');
    expect(lifecycleOf(rowOf(legacyTool))).toBe('deprecated');
    expect(lifecycleOf(rowOf(oldOperator))).toBe('archived');
  });

  it('counts a repository archived on GitHub without a lifecycle as archived', () => {
    expect(lifecycleOf({ ...rowOf(strayTool), archived: true })).toBe(
      'archived',
    );
  });
});

import { RepositoryRow } from '../apis';
import {
  legacyTool,
  newService,
  oldOperator,
  presentService,
  rowOf,
  strayTool,
} from '../fixtures/records';
import {
  lifecycleOf,
  markOf,
  SETUP_LEGEND,
  setupLabel,
  setupState,
} from './rows';

/** A declared repository's row with the set-up given. */
const declared = (setup: RepositoryRow['setup']): RepositoryRow => ({
  ...rowOf(presentService),
  setup,
});

const PENDING = {
  dispatchedAt: '2026-09-17T09:00:00Z',
  by: 'alice',
  kind: 'dispatched',
};

describe('setupState and markOf', () => {
  it.each<[string, RepositoryRow, string, string]>([
    ['converged', rowOf(presentService), 'converged', 'in sync'],
    ['not converged', rowOf(newService), 'not converged', 'not in sync'],
    ['undeclared', rowOf(strayTool), 'undeclared', 'not installed'],
    [
      'a run pending',
      declared({ converged: true, pendingRun: PENDING }),
      'run pending',
      'not reconciled',
    ],
    ['declared, not checked yet', declared({}), 'unchecked', 'not reconciled'],
    [
      'the check could not run',
      declared({ error: 'GitHub: 502 Bad Gateway' }),
      'unchecked',
      'failed',
    ],
    [
      'the declaration refused',
      declared({ converged: false, refused: true }),
      'refused',
      'failed',
    ],
    [
      'gone from GitHub',
      { ...rowOf(presentService), gone: true },
      'gone',
      'unknown',
    ],
  ])('%s is %s, marked %s', (_, row, state, mark) => {
    expect(setupState(row)).toBe(state);
    expect(markOf(row)).toBe(mark);
  });
});

describe('setupLabel', () => {
  it('says the state in the manager words with the gloss of the mark', () => {
    expect(setupLabel(rowOf(presentService))).toBe(
      'converged · set up as declared',
    );
    expect(setupLabel(rowOf(newService))).toBe(
      'not converged · off its declared set-up',
    );
    expect(setupLabel(rowOf(strayTool))).toBe(
      'undeclared · no declaration sets it up',
    );
    expect(setupLabel(declared({}))).toBe('unchecked · not reconciled yet');
  });

  it('names the manager reason where the check could not run', () => {
    expect(setupLabel(declared({ error: 'GitHub: 502 Bad Gateway' }))).toBe(
      'unchecked · the last check failed: GitHub: 502 Bad Gateway',
    );
  });

  it('lists every mark in the legend', () => {
    expect(SETUP_LEGEND).toBe(
      'in sync: set up as declared · not in sync: off its declared set-up · not reconciled: not reconciled yet · not installed: no declaration sets it up · failed: the last check failed · unknown: gone from GitHub',
    );
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

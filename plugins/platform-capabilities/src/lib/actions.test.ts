import {
  AGENT_PLATFORM_DEFINITION,
  DENIED_ACTION,
  REVERTED_ACTION,
  WITHDRAWN_ACTION,
} from '../fixtures/fakeApi';
import { inputFacts, kindOf, stateDetailOf, verbOf } from './actions';
import { fieldsOf, formOf } from './schemaForm';

describe('kindOf', () => {
  it("reads the kind from the first segment of the manager's name", () => {
    expect(kindOf('enable-gaggle-k3j9x2')).toBe('enable');
    expect(kindOf('reconcile-gaggle-a1b2c3')).toBe('reconcile');
  });
});

describe('stateDetailOf', () => {
  it('names who withdrew an action and why', () => {
    expect(stateDetailOf(WITHDRAWN_ACTION)).toBe(
      'Withdrawn by someone: rolled back for the freeze',
    );
  });

  it('names the pull request that reverted an action, else its commit', () => {
    expect(stateDetailOf(REVERTED_ACTION)).toBe('Reverted by #12.');
    const [pr] = REVERTED_ACTION.status!.pullRequests!;
    expect(
      stateDetailOf({
        ...REVERTED_ACTION,
        status: {
          ...REVERTED_ACTION.status,
          pullRequests: [{ ...pr, revert: { commit: pr.revert!.commit } }],
        },
      }),
    ).toBe('Reverted by 3f9c2e1.');
  });

  it('says nothing more for the other states', () => {
    expect(stateDetailOf(DENIED_ACTION)).toBeUndefined();
  });
});

describe('verbOf', () => {
  it('never says reconcile', () => {
    expect(verbOf('enable')).toBe('enable');
    expect(verbOf('reconcile')).not.toMatch(/reconcile/);
  });
});

describe('inputFacts', () => {
  const fields = fieldsOf(formOf(AGENT_PLATFORM_DEFINITION.inputSchema ?? {}));

  it('lists every leaf by its path, labelled and worded as the form does', () => {
    const facts = inputFacts(
      {
        installation: { chartLine: '3' },
        kagent: { enabled: true },
        portal: { enabled: false },
      },
      fields,
    );
    expect(facts.map(f => [f.label, f.value])).toEqual([
      ['Chart line', '3'],
      ['Kagent', 'on'],
      ['Portal', 'off'],
    ]);
  });

  it('words a leaf the schema does not describe as text', () => {
    const facts = inputFacts(
      {
        federation: { targets: ['a', 'b'], mode: { kind: 'hub' } },
        debug: true,
      },
      [],
    );
    expect(facts.map(f => [f.label, f.value])).toEqual([
      ['Targets', 'a, b'],
      ['Kind', 'hub'],
      ['Debug', 'on'],
    ]);
  });

  it('is empty without inputs', () => {
    expect(inputFacts(undefined, fields)).toEqual([]);
  });
});

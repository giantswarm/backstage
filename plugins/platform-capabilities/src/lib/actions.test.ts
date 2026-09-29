import { AGENT_PLATFORM_DEFINITION } from '../fixtures/fakeApi';
import { inputFacts, kindOf, verbOf } from './actions';
import { fieldsOf, formOf } from './schemaForm';

describe('kindOf', () => {
  it("reads the kind from the first segment of the manager's name", () => {
    expect(kindOf('enable-gaggle-k3j9x2')).toBe('enable');
    expect(kindOf('reconcile-gaggle-a1b2c3')).toBe('reconcile');
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

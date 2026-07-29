import { deriveSessionState, describeSessionState } from './kagentSessionState';
import { normalizeTaskList } from './kagentSessionDetail';

import kagentPrefixed from './__fixtures__/tasks.v0-9-9.json';
import unknownState from './__fixtures__/tasks.unknown-state.json';
import emptyNoData from './__fixtures__/tasks.empty-no-data.json';

function stateFor(fixture: unknown) {
  return deriveSessionState(normalizeTaskList(fixture).tasks);
}

describe('describeSessionState', () => {
  it.each([
    ['working', 'Working', true],
    ['input-required', 'Waiting for input', true],
    ['completed', 'Completed', false],
    ['failed', 'Failed', false],
    ['canceled', 'Canceled', false],
  ])('describes %s', (raw, label, isActive) => {
    expect(describeSessionState(raw)).toMatchObject({ raw, label, isActive });
  });

  it('is case-insensitive about the state name', () => {
    expect(describeSessionState('COMPLETED')).toMatchObject({
      label: 'Completed',
      // The raw value is kept verbatim, so the original casing survives.
      raw: 'COMPLETED',
    });
  });

  it('renders an unknown state as itself, and treats it as inactive', () => {
    // Claiming a session is still running on the strength of a state we cannot
    // interpret would show a spinner that never resolves.
    expect(describeSessionState('quantum-superposition')).toEqual({
      raw: 'quantum-superposition',
      label: 'quantum-superposition',
      tone: 'neutral',
      isActive: false,
    });
  });

  it.each([undefined, ''])('returns undefined for %p', input => {
    expect(describeSessionState(input)).toBeUndefined();
  });
});

describe('deriveSessionState', () => {
  it('takes the state of the most recent task', () => {
    // kagent returns tasks ORDER BY created_at ASC, so the last one is newest.
    // An earlier turn having completed says nothing about whether the session is
    // working now.
    expect(stateFor(kagentPrefixed)).toMatchObject({
      raw: 'working',
      isActive: true,
    });
  });

  it('keeps an unrecognised newest state rather than falling back to an older one', () => {
    expect(stateFor(unknownState)).toMatchObject({
      raw: 'quantum-superposition',
      label: 'quantum-superposition',
    });
  });

  it('skips trailing tasks that report no state at all', () => {
    const tasks = normalizeTaskList(kagentPrefixed).tasks;
    const stateless = { ...tasks[tasks.length - 1], status: undefined };

    expect(deriveSessionState([...tasks, stateless])).toMatchObject({
      raw: 'working',
    });
  });

  it('returns undefined for a session with no tasks', () => {
    // A real condition — created but never run — and distinct from every state
    // kagent could report, so it must not be flattened into one of them.
    expect(stateFor(emptyNoData)).toBeUndefined();
    expect(deriveSessionState([])).toBeUndefined();
  });
});

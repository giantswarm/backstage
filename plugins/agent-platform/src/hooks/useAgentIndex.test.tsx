import { renderHook } from '@testing-library/react';

import type { AgentRow } from '../components/AgentsDataProvider';
import { useAgentIndex } from './useAgentIndex';

const mockUseAgents = jest.fn();
jest.mock('../components/AgentsDataProvider', () => ({
  useAgents: () => mockUseAgents(),
}));

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'agent-platform/kagent/issue-tracker',
    installation: 'agent-platform',
    namespace: 'kagent',
    name: 'Issue tracker',
    technicalName: 'issue-tracker',
    description: '',
    skillCount: 0,
    readiness: 'ready',
    ...overrides,
  };
}

function indexedRow(index: Map<string, AgentRow>): AgentRow | undefined {
  return [...index.values()][0];
}

describe('useAgentIndex', () => {
  it('takes the settled session gate once agent-manager has been read', () => {
    // A cold load: the rows are built while agent-manager's availability is
    // still read, then again once it has settled — same agent, same name.
    mockUseAgents.mockReturnValue({
      rows: [agentRow({ isSessionPending: true })],
    });
    const { result, rerender } = renderHook(() => useAgentIndex());
    expect(indexedRow(result.current)?.isSessionPending).toBe(true);

    mockUseAgents.mockReturnValue({ rows: [agentRow()] });
    rerender();

    expect(indexedRow(result.current)?.isSessionPending).toBeFalsy();
  });

  it('takes a blocker that arrives after the rows', () => {
    mockUseAgents.mockReturnValue({ rows: [agentRow()] });
    const { result, rerender } = renderHook(() => useAgentIndex());

    mockUseAgents.mockReturnValue({
      rows: [agentRow({ sessionBlocker: 'No per-user sign-in.' })],
    });
    rerender();

    expect(indexedRow(result.current)?.sessionBlocker).toBe(
      'No per-user sign-in.',
    );
  });

  it('takes a renamed agent', () => {
    mockUseAgents.mockReturnValue({ rows: [agentRow()] });
    const { result, rerender } = renderHook(() => useAgentIndex());

    mockUseAgents.mockReturnValue({ rows: [agentRow({ name: 'Triage' })] });
    rerender();

    expect(indexedRow(result.current)?.name).toBe('Triage');
  });

  it('keeps the index while the rows say the same', () => {
    mockUseAgents.mockReturnValue({ rows: [agentRow()] });
    const { result, rerender } = renderHook(() => useAgentIndex());
    const first = result.current;

    mockUseAgents.mockReturnValue({ rows: [agentRow()] });
    rerender();

    expect(result.current).toBe(first);
  });
});

import { act, renderHook } from '@testing-library/react';

import type { AgentRow } from '../components/AgentsDataProvider';
import { useLastUsedAgent } from './useLastUsedAgent';

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'gazelle/kagent/sre-agent',
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'SRE Agent',
    technicalName: 'sre-agent',
    description: '',
    skillCount: 0,
    readiness: 'ready',
    ...overrides,
  };
}

const sre = agentRow();
const platform = agentRow({
  id: 'golem/kagent/platform-agent',
  installation: 'golem',
  name: 'Platform Agent',
  technicalName: 'platform-agent',
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('useLastUsedAgent', () => {
  it('has no default before anything has been started', () => {
    const { result } = renderHook(() => useLastUsedAgent([sre, platform]));

    expect(result.current.lastUsedAgent).toBeUndefined();
  });

  it('offers the remembered agent as the default', () => {
    const { result } = renderHook(() => useLastUsedAgent([sre, platform]));

    act(() => {
      result.current.rememberAgent(platform);
    });

    expect(result.current.lastUsedAgent).toEqual(platform);
  });

  it('survives a remount, which is the whole point', () => {
    const first = renderHook(() => useLastUsedAgent([sre, platform]));
    act(() => {
      first.result.current.rememberAgent(platform);
    });
    first.unmount();

    const second = renderHook(() => useLastUsedAgent([sre, platform]));

    expect(second.result.current.lastUsedAgent).toEqual(platform);
  });

  it('forgets an agent that is no longer in the fleet', () => {
    // A reference is stored rather than a copy precisely so a deleted agent
    // resolves to nothing instead of being offered as a default that cannot work.
    const { result, rerender } = renderHook(
      ({ agents }: { agents: AgentRow[] }) => useLastUsedAgent(agents),
      { initialProps: { agents: [sre, platform] } },
    );

    act(() => {
      result.current.rememberAgent(platform);
    });
    rerender({ agents: [sre] });

    expect(result.current.lastUsedAgent).toBeUndefined();
  });

  it('does not default to an agent that has stopped being ready', () => {
    // It is still listed in the picker, disabled and with the reason — but
    // preselecting it would present a default that Start refuses.
    const { result, rerender } = renderHook(
      ({ agents }: { agents: AgentRow[] }) => useLastUsedAgent(agents),
      { initialProps: { agents: [sre] } },
    );

    act(() => {
      result.current.rememberAgent(sre);
    });
    expect(result.current.lastUsedAgent).toEqual(sre);

    rerender({ agents: [agentRow({ readiness: 'notReady' })] });

    expect(result.current.lastUsedAgent).toBeUndefined();
  });

  it('replaces the memory rather than accumulating', () => {
    const { result } = renderHook(() => useLastUsedAgent([sre, platform]));

    act(() => {
      result.current.rememberAgent(platform);
    });
    act(() => {
      result.current.rememberAgent(sre);
    });

    expect(result.current.lastUsedAgent).toEqual(sre);
  });
});

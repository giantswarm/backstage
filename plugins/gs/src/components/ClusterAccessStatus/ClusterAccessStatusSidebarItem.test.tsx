import { ClusterAccessStatusEntry } from '../../apis/clusterAccessStatus';
import { summarize } from './ClusterAccessStatusSidebarItem';

function entry(
  installation: string,
  state: ClusterAccessStatusEntry['state'],
  reason?: string,
): ClusterAccessStatusEntry {
  return { installation, state, reason, lastChecked: 0 };
}

describe('summarize', () => {
  it('collapses to a single muted part when everything is healthy', () => {
    const parts = summarize([
      entry('a', 'healthy'),
      entry('b', 'healthy'),
      entry('c', 'healthy'),
    ]);

    expect(parts).toEqual([
      { key: 'healthy', label: 'All 3 healthy', muted: true },
    ]);
  });

  it('lists non-empty states worst-first with healthy muted', () => {
    const parts = summarize([
      entry('a', 'healthy'),
      entry('b', 'degraded', 'Access forbidden'),
      entry('c', 'healthy'),
      entry('d', 'session-expired'),
    ]);

    expect(parts).toEqual([
      { key: 'session-expired', label: '1 session expired', muted: false },
      { key: 'degraded', label: '1 degraded', muted: false },
      { key: 'healthy', label: '2 healthy', muted: true },
    ]);
  });

  it('omits states with a zero count', () => {
    const parts = summarize([entry('a', 'connecting'), entry('b', 'degraded')]);

    expect(parts.map(p => p.key)).toEqual(['degraded', 'connecting']);
  });
});

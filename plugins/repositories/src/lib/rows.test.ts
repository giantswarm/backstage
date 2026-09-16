import {
  newService,
  presentService,
  rowOf,
  strayTool,
} from '../fixtures/records';
import { countTiles, durationSeconds, sortRows } from './rows';

const rows = [presentService, newService, strayTool].map(rowOf);

describe('countTiles', () => {
  it('counts set-up states, score bands and lifecycles over the rows', () => {
    expect(countTiles(rows)).toEqual({
      setup: { converged: 1, 'not converged': 1, unchecked: 1 },
      score: { healthy: 1, watch: 1, orphan: 1 },
      lifecycle: { active: 3 },
    });
  });

  it('counts an archived repository without a lifecycle as archived', () => {
    const archived = { ...rowOf(strayTool), archived: true };
    expect(countTiles([archived]).lifecycle).toEqual({ archived: 1 });
  });
});

describe('sortRows', () => {
  it('sorts by repository name either way', () => {
    expect(sortRows(rows, 'repository', 'asc').map(r => r.repository)).toEqual([
      'giantswarm/new-service',
      'giantswarm/present-service',
      'giantswarm/stray-tool',
    ]);
    expect(sortRows(rows, 'repository', 'desc')[0].repository).toBe(
      'giantswarm/stray-tool',
    );
  });

  it('sorts by score, set-up state, findings and age', () => {
    expect(sortRows(rows, 'score', 'desc').map(r => r.orphan.score)).toEqual([
      100, 50, 0,
    ]);
    expect(sortRows(rows, 'setup', 'asc').map(r => r.repository)).toEqual([
      'giantswarm/new-service',
      'giantswarm/stray-tool',
      'giantswarm/present-service',
    ]);
    expect(sortRows(rows, 'age', 'asc').map(r => r.age)).toEqual([
      '12s',
      '5m3s',
      '1h5m3s',
    ]);
  });

  it('puts repositories without a person commit last when ascending', () => {
    const sorted = sortRows(rows, 'lastPersonCommit', 'asc');
    expect(sorted[0].repository).toBe('giantswarm/new-service');
    expect(sorted[sorted.length - 1].repository).toBe(
      'giantswarm/present-service',
    );
  });

  it('keeps the manager order for ties and does not mutate the input', () => {
    const copy = [...rows];
    sortRows(rows, 'team', 'asc');
    expect(rows).toEqual(copy);
    expect(sortRows(rows, 'lifecycle', 'asc')).toEqual(rows);
  });
});

describe('durationSeconds', () => {
  it('reads Go durations', () => {
    expect(durationSeconds('5m3s')).toBe(303);
    expect(durationSeconds('1h5m3s')).toBe(3903);
    expect(durationSeconds('12s')).toBe(12);
    expect(durationSeconds(undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});

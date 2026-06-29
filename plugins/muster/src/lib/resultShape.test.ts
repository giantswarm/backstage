import { detectTable } from './resultShape';

describe('detectTable', () => {
  it('detects a k8s List shape and flattens metadata', () => {
    const table = detectTable({
      kind: 'PodList',
      items: [
        { metadata: { name: 'a', namespace: 'ns1' }, status: 'Running' },
        { metadata: { name: 'b', namespace: 'ns2' }, status: 'Pending' },
      ],
    });
    expect(table).not.toBeNull();
    expect(table!.columns.slice(0, 2)).toEqual(['name', 'namespace']);
    expect(table!.rows).toHaveLength(2);
    expect(table!.rows[0].name).toBe('a');
  });

  it('detects a bare array of like-shaped objects', () => {
    const table = detectTable([
      { name: 'x', value: 1 },
      { name: 'y', value: 2 },
    ]);
    expect(table).not.toBeNull();
    expect(table!.columns).toContain('name');
  });

  it('returns null for scalars, single objects, and empty lists', () => {
    expect(detectTable('hello')).toBeNull();
    expect(detectTable(42)).toBeNull();
    expect(detectTable({ a: 1 })).toBeNull();
    expect(detectTable({ items: [] })).toBeNull();
    expect(detectTable([])).toBeNull();
  });
});

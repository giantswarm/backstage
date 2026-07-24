import { checkStoryCoverage, isStoryCoverageComplete } from './storyCoverage';

describe('checkStoryCoverage', () => {
  it('reports nothing when every exported component has a story', () => {
    const result = checkStoryCoverage({
      exportedComponents: ['AsyncValue', 'InfoCard', 'NotAvailable'],
      storiedComponents: ['AsyncValue', 'InfoCard', 'NotAvailable'],
      allowlist: [],
    });

    expect(result.undocumented).toEqual([]);
    expect(result.staleAllowlist).toEqual([]);
    expect(isStoryCoverageComplete(result)).toBe(true);
  });

  it('reports a component that is missing a story', () => {
    const result = checkStoryCoverage({
      exportedComponents: ['AsyncValue', 'InfoCard'],
      storiedComponents: ['AsyncValue'],
      allowlist: [],
    });

    expect(result.undocumented).toEqual(['InfoCard']);
    expect(isStoryCoverageComplete(result)).toBe(false);
  });

  it('does not report an allowlisted component that is missing a story', () => {
    const result = checkStoryCoverage({
      exportedComponents: ['AsyncValue', 'PageHeaderActions'],
      storiedComponents: ['AsyncValue'],
      allowlist: ['PageHeaderActions'],
    });

    expect(result.undocumented).toEqual([]);
    expect(result.staleAllowlist).toEqual([]);
    expect(isStoryCoverageComplete(result)).toBe(true);
  });

  it('surfaces an allowlist entry that no longer matches any export', () => {
    const result = checkStoryCoverage({
      exportedComponents: ['AsyncValue'],
      storiedComponents: ['AsyncValue'],
      allowlist: ['RemovedComponent'],
    });

    expect(result.undocumented).toEqual([]);
    expect(result.staleAllowlist).toEqual(['RemovedComponent']);
    expect(isStoryCoverageComplete(result)).toBe(false);
  });

  it('reports both undocumented components and stale allowlist entries together', () => {
    const result = checkStoryCoverage({
      exportedComponents: ['AsyncValue', 'InfoCard', 'CodeBlock'],
      storiedComponents: ['AsyncValue'],
      allowlist: ['StaleName'],
    });

    // CodeBlock and InfoCard have no story and aren't allowlisted; result is sorted.
    expect(result.undocumented).toEqual(['CodeBlock', 'InfoCard']);
    expect(result.staleAllowlist).toEqual(['StaleName']);
  });
});

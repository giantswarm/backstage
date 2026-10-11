import { toolsetSummaryLabel } from './reviewParts';

describe('toolsetSummaryLabel', () => {
  it('names presets and whole connectors in words, as the grid does', () => {
    expect(
      toolsetSummaryLabel('composed', [
        'preset:read-only',
        'server:agent-manager',
      ]),
    ).toBe('Read-only tools everywhere; all agent-manager tools');
  });

  it('counts tools and workflows picked one by one rather than listing them', () => {
    expect(
      toolsetSummaryLabel('composed', [
        'server:kubernetes',
        'tool:x_cluster-manager_list_clusters',
        'tool:x_cluster-manager_get_cluster',
        'workflow:deploy',
      ]),
    ).toBe('All kubernetes tools; 2 individual tools; 1 workflow');
  });

  it('calls an installation’s own preset a preset', () => {
    expect(toolsetSummaryLabel('composed', ['preset:sre'])).toBe(
      'The sre preset',
    );
  });

  it('keeps the loud labels for no tools and the full gateway', () => {
    expect(toolsetSummaryLabel('none', ['preset:none'])).toBe('No tools');
    expect(toolsetSummaryLabel('full', ['preset:full'])).toBe(
      'Full gateway access',
    );
  });
});

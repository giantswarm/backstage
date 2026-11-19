import {
  connectorPageKey,
  connectorPageKeyLabel,
  connectorPageParams,
  isOrganizationConnectorPageKey,
  organizationConnectorPageKey,
} from './connectorAddress';

describe('connector page addresses', () => {
  it.each([
    ['wiki', { server: 'wiki' }],
    ['muster', { server: 'muster' }],
    ['-/org-gazelle/wiki', { namespace: 'org-gazelle', server: 'wiki' }],
    // Not `-/<namespace>/<name>`: a bare name, which no page has.
    ['-/org-gazelle', { server: '-/org-gazelle' }],
    ['-/org-gazelle/wiki/x', { server: '-/org-gazelle/wiki/x' }],
    ['-//wiki', { server: '-//wiki' }],
  ])('reads %s', (key, params) => {
    expect(connectorPageParams(key)).toEqual(params);
  });

  it('builds the key of route params, and back', () => {
    expect(connectorPageKey({ server: 'wiki' })).toBe('wiki');
    expect(connectorPageKey({ server: 'wiki', namespace: 'org-golem' })).toBe(
      '-/org-golem/wiki',
    );
    expect(organizationConnectorPageKey('org-golem', 'wiki')).toBe(
      '-/org-golem/wiki',
    );
    expect(
      connectorPageParams(connectorPageKey({ server: 'wiki', namespace: 'x' })),
    ).toEqual({ server: 'wiki', namespace: 'x' });
  });

  it("tells an organization's address apart and labels it by muster's key", () => {
    expect(isOrganizationConnectorPageKey('-/org-golem/wiki')).toBe(true);
    expect(isOrganizationConnectorPageKey('wiki')).toBe(false);
    expect(connectorPageKeyLabel('-/org-golem/wiki')).toBe('org-golem/wiki');
    expect(connectorPageKeyLabel('wiki')).toBe('wiki');
  });
});

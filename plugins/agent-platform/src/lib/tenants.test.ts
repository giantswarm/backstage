import {
  defaultTenant,
  organizationOf,
  tenantGroups,
  tenantInSentence,
  tenantOf,
} from './tenants';

describe('tenantOf', () => {
  it.each([
    ['kagent', 'None'],
    ['org-acme', 'acme'],
    ['team-a', 'namespace team-a'],
    // `org-` alone names no organization.
    ['org-', 'namespace org-'],
    // An organization called none never reads as the platform's None.
    ['org-none', 'organization none'],
    ['org-None', 'organization None'],
    ['org-platform', 'platform'],
  ])('names namespace %s as %s', (namespace, tenant) => {
    expect(tenantOf(namespace)).toBe(tenant);
  });
});

describe('tenantInSentence', () => {
  it.each([
    ['kagent', 'the platform'],
    ['org-acme', 'the acme organization'],
    ['team-a', 'namespace team-a'],
  ])('names namespace %s as %s in a sentence', (namespace, tenant) => {
    expect(tenantInSentence(namespace)).toBe(tenant);
  });
});

describe('organizationOf', () => {
  it.each([
    ['org-acme', 'acme'],
    ['org-', undefined],
    ['kagent', undefined],
    ['team-a', undefined],
  ])('reads namespace %s as organization %s', (namespace, organization) => {
    expect(organizationOf(namespace)).toBe(organization);
  });
});

describe('tenantGroups', () => {
  it('groups the platform, the organizations and the other namespaces, in that order', () => {
    expect(
      tenantGroups(['team-a', 'org-acme', 'kagent', 'org-', 'org-beta']),
    ).toEqual({
      kinds: ['platform', 'organization', 'namespace'],
      byKind: {
        platform: ['kagent'],
        organization: ['org-acme', 'org-beta'],
        namespace: ['team-a', 'org-'],
      },
    });
  });

  it('lists only the kinds present', () => {
    expect(tenantGroups(['kagent', 'team-a']).kinds).toEqual([
      'platform',
      'namespace',
    ]);
  });
});

describe('defaultTenant', () => {
  it.each([
    [['org-acme', 'kagent', 'team-a'], 'kagent'],
    [['team-a', 'org-beta', 'org-acme'], 'org-beta'],
    [['team-b', 'team-a'], 'team-b'],
    [[], undefined],
  ])('picks the first offered of %j', (choices, expected) => {
    expect(defaultTenant(choices)).toBe(expected);
  });
});

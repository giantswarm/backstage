import {
  organizationOf,
  tenantGroups,
  tenantInSentence,
  tenantKindProblem,
  tenantOf,
} from './tenants';

describe('tenantOf', () => {
  it.each([
    ['kagent', 'Platform'],
    ['org-acme', 'acme'],
    ['team-a', 'namespace team-a'],
    // `org-` alone names no organization.
    ['org-', 'namespace org-'],
    // An organization called platform never reads as the platform.
    ['org-platform', 'organization platform'],
    ['org-Platform', 'organization Platform'],
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

describe('tenantKindProblem', () => {
  it.each([
    [['platform', 'organization'] as const, 'Choose Platform or Organization.'],
    [
      ['platform', 'organization', 'namespace'] as const,
      'Choose Platform, Organization or Other namespace.',
    ],
  ])('asks for one of %j', (kinds, problem) => {
    expect(tenantKindProblem(kinds)).toBe(problem);
  });
});

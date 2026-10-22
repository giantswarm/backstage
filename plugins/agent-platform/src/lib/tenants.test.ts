import { organizationOf, tenantInSentence, tenantOf } from './tenants';

describe('tenantOf', () => {
  it.each([
    ['kagent', 'Platform'],
    ['org-acme', 'acme'],
    ['team-a', 'namespace team-a'],
    // `org-` alone names no organization.
    ['org-', 'namespace org-'],
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

import { tenantOf } from './tenants';

describe('tenantOf', () => {
  it.each([
    ['kagent', 'platform'],
    ['org-acme', 'organization acme'],
    ['team-a', 'namespace team-a'],
    // `org-` alone names no organization.
    ['org-', 'namespace org-'],
  ])('names namespace %s as %s, as Slack does', (namespace, tenant) => {
    expect(tenantOf(namespace)).toBe(tenant);
  });
});

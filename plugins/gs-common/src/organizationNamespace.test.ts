import { organizationNameOfNamespace } from './organizationNamespace';

describe('organizationNameOfNamespace', () => {
  it.each([
    ['org-marian', 'marian'],
    ['org-agent-platform-test-b', 'agent-platform-test-b'],
    ['team-a', undefined],
    ['kagent', undefined],
    // The prefix alone names nothing, and it only counts at the start.
    ['org-', undefined],
    ['agents-org-x', undefined],
  ])('reads %s as %s', (namespace, organization) => {
    expect(organizationNameOfNamespace(namespace)).toBe(organization);
  });
});

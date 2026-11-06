import { organizationDirectory } from './organizations';
import {
  creatorOf,
  defaultTenant,
  organizationOf,
  ownerOf,
  tenantGroups,
  tenantInSentence,
  tenantOf,
} from './tenants';

// Which namespace is which organization, as agent-manager's
// `list_my_organizations` answers it from the namespaces' labels. The
// namespace's name says nothing: `org-legacy` is a Giant Swarm Organization's
// namespace that no answer names, so it is no organization.
const directory = organizationDirectory([
  { namespace: 'agents-acme-x7k2q', organization: 'acme', parent: 'org-acme' },
  { namespace: 'agents-beta-p3m9z', organization: 'beta', parent: 'org-acme' },
  { namespace: 'agents-none-a1b2c', organization: 'none', parent: 'org-x' },
  { namespace: 'agents-pf-d4e5f', organization: 'platform', parent: 'org-x' },
]);

describe('creatorOf', () => {
  it.each([
    ['ana@example.com', 'organization', 'ana@example.com'],
    ['ana@example.com', 'platform', 'ana@example.com'],
    [undefined, 'platform', 'Platform'],
    [undefined, 'namespace', 'Platform'],
    ['', 'platform', 'Platform'],
    [undefined, 'organization', undefined],
    ['', 'organization', undefined],
  ] as const)(
    '%p in a %s namespace reads as %p',
    (createdBy, kind, expected) => {
      expect(creatorOf(createdBy, kind)).toBe(expected);
    },
  );

  it.each([
    ['ana@example.com', 'Ana Example', 'organization', 'Ana Example'],
    ['ana@example.com', 'Ana Example', 'platform', 'Ana Example'],
    ['ana@example.com', '', 'organization', 'ana@example.com'],
    ['ana@example.com', undefined, 'platform', 'ana@example.com'],
    [undefined, undefined, 'platform', 'Platform'],
    [undefined, undefined, 'organization', undefined],
  ] as const)(
    '%p named %p in a %s namespace reads as %p',
    (createdBy, createdByName, kind, expected) => {
      expect(creatorOf(createdBy, kind, createdByName)).toBe(expected);
    },
  );
});

describe('tenantOf', () => {
  it.each([
    ['kagent', 'None'],
    ['agents-acme-x7k2q', 'acme'],
    ['team-a', 'namespace team-a'],
    // A name prefix names no organization: only agent-manager's answer does.
    ['org-legacy', 'namespace org-legacy'],
    // An organization called none never reads as the platform's None.
    ['agents-none-a1b2c', 'organization none'],
    ['agents-pf-d4e5f', 'platform'],
  ])('names namespace %s as %s', (namespace, tenant) => {
    expect(tenantOf(namespace, directory)).toBe(tenant);
  });
});

describe('ownerOf', () => {
  it.each([
    ['kagent', 'Platform'],
    ['agents-acme-x7k2q', 'acme'],
    ['team-a', 'namespace team-a'],
    ['org-legacy', 'namespace org-legacy'],
    // An organization called platform never reads as the platform.
    ['agents-pf-d4e5f', 'organization platform'],
    ['agents-none-a1b2c', 'none'],
  ])('names namespace %s as %s', (namespace, owner) => {
    expect(ownerOf(namespace, directory)).toBe(owner);
  });
});

describe('tenantInSentence', () => {
  it.each([
    ['kagent', 'the platform'],
    ['agents-acme-x7k2q', 'the acme organization'],
    ['team-a', 'namespace team-a'],
  ])('names namespace %s as %s in a sentence', (namespace, tenant) => {
    expect(tenantInSentence(namespace, directory)).toBe(tenant);
  });
});

describe('organizationOf', () => {
  it.each([
    ['agents-acme-x7k2q', 'acme'],
    ['org-legacy', undefined],
    ['kagent', undefined],
    ['team-a', undefined],
  ])('reads namespace %s as organization %s', (namespace, organization) => {
    expect(organizationOf(namespace, directory)?.organization).toBe(
      organization,
    );
  });
});

describe('tenantGroups', () => {
  it('groups the platform, the organizations and the other namespaces, in that order', () => {
    expect(
      tenantGroups(
        [
          'team-a',
          'agents-acme-x7k2q',
          'kagent',
          'org-legacy',
          'agents-beta-p3m9z',
        ],
        directory,
      ),
    ).toEqual({
      kinds: ['platform', 'organization', 'namespace'],
      byKind: {
        platform: ['kagent'],
        organization: ['agents-acme-x7k2q', 'agents-beta-p3m9z'],
        namespace: ['team-a', 'org-legacy'],
      },
    });
  });

  it('lists only the kinds present', () => {
    expect(tenantGroups(['kagent', 'team-a'], directory).kinds).toEqual([
      'platform',
      'namespace',
    ]);
  });
});

describe('defaultTenant', () => {
  it.each([
    [['agents-acme-x7k2q', 'kagent', 'team-a'], 'kagent'],
    [['team-a', 'agents-beta-p3m9z', 'agents-acme-x7k2q'], 'agents-beta-p3m9z'],
    [['team-b', 'team-a'], 'team-b'],
    [[], undefined],
  ])('picks the first offered of %j', (choices, expected) => {
    expect(defaultTenant(choices, directory)).toBe(expected);
  });
});

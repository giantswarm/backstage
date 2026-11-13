import { organizationDirectory } from './organizations';
import {
  creatorOf,
  defaultTenant,
  organizationOf,
  namespacesSharingAName,
  ownerDisplayOf,
  ownerOf,
  tenantGroups,
  tenantInSentence,
  tenantOf,
} from './tenants';

// Which namespace is which organization, as agent-manager's
// `list_organizations` answers it from the namespaces' labels. The
// namespace's name decides nothing: `org-legacy` is a Giant Swarm
// Organization's namespace that no answer names, so it is no Agent Platform
// organization, only named as the Giant Swarm one.
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
    // Any other namespace reads as it is, with no `namespace` qualifier.
    ['team-a', 'team-a'],
    // A Giant Swarm organization's namespace reads as the organization.
    ['org-legacy', 'legacy'],
    ['org-agent-platform-test-b', 'agent-platform-test-b'],
    ['org-', 'org-'],
    // Nothing reads as the platform's None: an organization called none, a
    // namespace called none; a Giant Swarm organization called none keeps
    // its namespace.
    ['agents-none-a1b2c', 'organization none'],
    ['org-none', 'org-none'],
    ['none', 'namespace none'],
    ['NONE', 'namespace NONE'],
    ['agents-pf-d4e5f', 'platform'],
  ])('names namespace %s as %s', (namespace, tenant) => {
    expect(tenantOf(namespace, directory)).toBe(tenant);
  });
});

describe('namespacesSharingAName', () => {
  it('finds the namespaces another one reads the same as', () => {
    expect(
      namespacesSharingAName(
        [
          'kagent',
          // The organization acme, and the Giant Swarm organization acme.
          'agents-acme-x7k2q',
          'org-acme',
          'org-team-x',
          'team-x',
          'org-marian',
          'TEAM-X',
        ],
        directory,
      ),
    ).toEqual(
      new Set([
        'agents-acme-x7k2q',
        'org-acme',
        'org-team-x',
        'team-x',
        'TEAM-X',
      ]),
    );
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

describe('ownerDisplayOf', () => {
  const named = organizationDirectory([
    {
      namespace: 'agents-default-x7k2q',
      organization: 'default',
      parent: 'org-gs',
      displayName: 'Lab',
    },
    {
      namespace: 'agents-acme-x7k2q',
      organization: 'acme',
      parent: 'org-acme',
    },
  ]);

  it.each([
    ['kagent', 'Platform'],
    ['agents-default-x7k2q', 'Lab'],
    ['agents-acme-x7k2q', 'acme'],
    ['team-a', 'namespace team-a'],
  ])('names namespace %s as %s', (namespace, owner) => {
    expect(ownerDisplayOf(namespace, named)).toBe(owner);
  });
});

describe('tenantInSentence', () => {
  it.each([
    ['kagent', 'the platform'],
    ['agents-acme-x7k2q', 'the acme organization'],
    ['team-a', 'namespace team-a'],
    // As tenantOf names them: a Giant Swarm organization by its name, unless
    // that would read as the platform's None.
    ['org-legacy', 'the legacy organization'],
    ['org-none', 'namespace org-none'],
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

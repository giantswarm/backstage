import type { RbacSubjectRow } from '../../clusters/cluster-details/ClusterRBAC/utils';
import { matchRow, splitByQuery } from './search';

const readers: RbacSubjectRow = {
  id: 'Group//oidc:fern-readers',
  kind: 'Group',
  name: 'oidc:fern-readers',
  isSystem: false,
  clusterWide: true,
  namespaces: ['org-fern'],
  roles: ['read-all', 'view'],
  bindings: [
    {
      bindingKind: 'ClusterRoleBinding',
      bindingName: 'platform-readers',
      roleKind: 'ClusterRole',
      roleName: 'read-all',
    },
    {
      bindingKind: 'RoleBinding',
      bindingName: 'organization-fern-guest-readers',
      roleKind: 'ClusterRole',
      roleName: 'view',
      namespace: 'org-fern',
    },
  ],
  rolesText: 'read-all, view',
  scopeText: 'Cluster-wide, org-fern',
};

const deployer: RbacSubjectRow = {
  ...readers,
  id: 'ServiceAccount/org-fern/deployer',
  kind: 'ServiceAccount',
  name: 'deployer',
  namespace: 'org-fern',
  bindings: [],
};

describe('matchRow', () => {
  it('matches everything without a query', () => {
    expect(matchRow(readers, '  ')).toEqual({
      visible: true,
      bindings: new Set(),
    });
  });

  it.each([
    ['the subject, in any case', 'DEPLOY'],
    ['a service account’s namespace', 'org-fern/dep'],
    ['the kind', 'serviceacc'],
    ['a role', 'read-all'],
    ['the access scope', 'cluster-wide'],
  ])('matches by %s, as the row shows it', (_, query) => {
    expect(matchRow(deployer, query)?.visible).toBe(true);
  });

  it('matches by a binding’s name, and says which binding', () => {
    const match = matchRow(readers, 'Guest');
    expect(match?.visible).toBe(false);
    expect([...match!.bindings].map(b => b.bindingName)).toEqual([
      'organization-fern-guest-readers',
    ]);
  });

  it('matches by a binding’s namespace', () => {
    const match = matchRow({ ...readers, scopeText: 'Cluster-wide' }, 'org-f');
    expect([...match!.bindings].map(b => b.bindingName)).toEqual([
      'organization-fern-guest-readers',
    ]);
  });

  it('does not match what neither the row nor its bindings show', () => {
    expect(matchRow(readers, 'nettle')).toBeUndefined();
  });
});

describe('splitByQuery', () => {
  it('cuts the text at each occurrence, in any case, keeping its case', () => {
    expect(splitByQuery('Guest-guest-x', 'GUEST')).toEqual([
      { text: 'Guest', isMatch: true },
      { text: '-', isMatch: false },
      { text: 'guest', isMatch: true },
      { text: '-x', isMatch: false },
    ]);
  });
});

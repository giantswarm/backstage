import {
  ClusterRoleBinding,
  RoleBinding,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildRbacSubjectRows } from './utils';

const clusterRoleBinding = new ClusterRoleBinding(
  {
    kind: 'ClusterRoleBinding',
    apiVersion: 'rbac.authorization.k8s.io/v1',
    metadata: { name: 'customer-admins' },
    subjects: [
      { kind: 'Group', apiGroup: 'rbac.authorization.k8s.io', name: 'admins' },
      { kind: 'Group', apiGroup: 'rbac.authorization.k8s.io', name: 'system:masters' },
    ],
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'cluster-admin',
    },
  },
  'test-installation',
);

const roleBinding = new RoleBinding(
  {
    kind: 'RoleBinding',
    apiVersion: 'rbac.authorization.k8s.io/v1',
    metadata: { name: 'dev-edit', namespace: 'org-acme' },
    subjects: [
      { kind: 'Group', apiGroup: 'rbac.authorization.k8s.io', name: 'admins' },
      {
        kind: 'ServiceAccount',
        name: 'automation',
        namespace: 'org-acme',
      },
    ],
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'edit',
    },
  },
  'test-installation',
);

describe('buildRbacSubjectRows', () => {
  it('groups bindings by subject with scope and system detection', () => {
    const rows = buildRbacSubjectRows([roleBinding], [clusterRoleBinding]);

    expect(rows.map(row => row.name)).toEqual([
      'admins',
      'system:masters',
      'automation',
    ]);

    const admins = rows[0];
    expect(admins.kind).toBe('Group');
    expect(admins.isSystem).toBe(false);
    expect(admins.clusterWide).toBe(true);
    expect(admins.namespaces).toEqual(['org-acme']);
    expect(admins.roles).toEqual(['cluster-admin', 'edit']);
    expect(admins.scopeText).toBe('Cluster-wide, org-acme');
    expect(admins.bindings).toHaveLength(2);

    expect(rows[1].isSystem).toBe(true);

    const automation = rows[2];
    expect(automation.kind).toBe('ServiceAccount');
    expect(automation.namespace).toBe('org-acme');
    expect(automation.clusterWide).toBe(false);
    expect(automation.scopeText).toBe('org-acme');
  });

  it('handles bindings without subjects', () => {
    const orphan = new ClusterRoleBinding(
      {
        kind: 'ClusterRoleBinding',
        apiVersion: 'rbac.authorization.k8s.io/v1',
        metadata: { name: 'orphan' },
        subjects: null,
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'ClusterRole',
          name: 'view',
        },
      },
      'test-installation',
    );

    expect(buildRbacSubjectRows([], [orphan])).toEqual([]);
  });
});

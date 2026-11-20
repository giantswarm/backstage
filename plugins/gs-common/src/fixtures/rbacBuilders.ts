import type { BuilderContext, FixtureInstallation } from './builders';
import type { FixtureCluster } from './clusterBuilders';
import { createNamer, fitName, MAX_NAME_LENGTH } from './names';
import { createRandom, hashOf } from './random';

/** Who a binding grants its role to. */
export type FixtureRbacSubject = {
  kind: 'User' | 'Group' | 'ServiceAccount';
  name: string;
  /** A service account's namespace. */
  namespace?: string;
};

/**
 * A RoleBinding (in its namespace) or a ClusterRoleBinding in an
 * installation's management cluster: who holds which role, and where.
 */
export type FixtureRbacBinding = {
  installation: string;
  kind: 'RoleBinding' | 'ClusterRoleBinding';
  name: string;
  /** A RoleBinding's namespace. */
  namespace?: string;
  role: { kind: 'Role' | 'ClusterRole'; name: string };
  subjects: FixtureRbacSubject[];
  createdAt: string;
};

export type FixtureRbacSettings = {
  /**
   * People with a binding of their own in an organization's namespace, per
   * installation (3 by default), and the least length of the made-up names
   * of people, groups and service accounts. A count of 0 leaves every
   * installation without bindings.
   */
  rbacSubjects?: { count?: number; nameLength?: number };
};

/** Whatever the data set, made-up people's addresses are at this domain. */
const EMAIL_DOMAIN = 'example.com';

/**
 * The bindings Kubernetes and its components bring along: every subject a
 * system one (`system:` names, `kube-` namespaces), as on any cluster.
 */
function systemBindings(): Omit<
  FixtureRbacBinding,
  'installation' | 'createdAt'
>[] {
  const clusterRole = (name: string) => ({
    kind: 'ClusterRole' as const,
    name,
  });
  return [
    {
      kind: 'ClusterRoleBinding',
      name: 'cluster-admin',
      role: clusterRole('cluster-admin'),
      subjects: [{ kind: 'Group', name: 'system:masters' }],
    },
    {
      kind: 'ClusterRoleBinding',
      name: 'system:kube-controller-manager',
      role: clusterRole('system:kube-controller-manager'),
      subjects: [{ kind: 'User', name: 'system:kube-controller-manager' }],
    },
    {
      kind: 'ClusterRoleBinding',
      name: 'system:kube-scheduler',
      role: clusterRole('system:kube-scheduler'),
      subjects: [{ kind: 'User', name: 'system:kube-scheduler' }],
    },
    {
      kind: 'ClusterRoleBinding',
      name: 'system:node-proxier',
      role: clusterRole('system:node-proxier'),
      subjects: [{ kind: 'User', name: 'system:kube-proxy' }],
    },
    {
      kind: 'ClusterRoleBinding',
      name: 'system:discovery',
      role: clusterRole('system:discovery'),
      subjects: [{ kind: 'Group', name: 'system:authenticated' }],
    },
    {
      kind: 'ClusterRoleBinding',
      name: 'system:public-info-viewer',
      role: clusterRole('system:public-info-viewer'),
      subjects: [
        { kind: 'Group', name: 'system:authenticated' },
        { kind: 'Group', name: 'system:unauthenticated' },
      ],
    },
    {
      kind: 'ClusterRoleBinding',
      name: 'system:coredns',
      role: clusterRole('system:coredns'),
      subjects: [
        { kind: 'ServiceAccount', name: 'coredns', namespace: 'kube-system' },
      ],
    },
    {
      kind: 'RoleBinding',
      name: 'system::leader-locking-kube-scheduler',
      namespace: 'kube-system',
      role: {
        kind: 'Role',
        name: 'system::leader-locking-kube-scheduler',
      },
      subjects: [
        { kind: 'User', name: 'system:kube-scheduler' },
        {
          kind: 'ServiceAccount',
          name: 'kube-scheduler',
          namespace: 'kube-system',
        },
      ],
    },
    {
      kind: 'RoleBinding',
      name: 'system:controller:bootstrap-signer',
      namespace: 'kube-system',
      role: { kind: 'Role', name: 'system:controller:bootstrap-signer' },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: 'bootstrap-signer',
          namespace: 'kube-system',
        },
      ],
    },
  ];
}

/**
 * The RBAC bindings of each installation's management cluster, which the
 * cluster page's RBAC tab lists: in every installation, the system ones
 * Kubernetes brings along; and in every installation but the second, which
 * has only those (so the tab's "only system subjects" state can be seen), the
 * platform team's groups with `cluster-admin` and `read-all` cluster-wide, an
 * automation service account, and per organization of the installation's
 * workload clusters its admins' group and a person with `cluster-admin` in
 * its namespace and a deployer service account with `edit`, its readers'
 * group with `view` there and in the next organization's; then `count`
 * people with `view` in an organization's namespace each. Drawn from a seed
 * of each installation's own, so adding them changed no other list.
 */
export function buildRbacBindings(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  clusters: readonly FixtureCluster[],
  settings: FixtureRbacSettings = {},
): FixtureRbacBinding[] {
  const count = settings.rbacSubjects?.count ?? 3;
  if (count === 0) {
    return [];
  }
  const nameLength = settings.rbacSubjects?.nameLength ?? 0;
  return installations.flatMap((installation, index) => {
    const createdAt =
      clusters.find(
        c => c.installation === installation.name && c.kind === 'management',
      )?.createdAt ?? new Date(context.now).toISOString();
    const inInstallation = (
      binding: Omit<FixtureRbacBinding, 'installation' | 'createdAt'>,
    ): FixtureRbacBinding => ({
      ...binding,
      installation: installation.name,
      createdAt,
    });
    const system = systemBindings().map(inInstallation);
    if (index === 1) {
      return system;
    }

    const random = createRandom(hashOf(`${installation.name}/rbac`));
    const name = createNamer(random);
    const person = () => `${name(nameLength).name}@${EMAIL_DOMAIN}`;
    const platformAdmins = `oidc:${name(nameLength).name}-platform-admins`;
    const platformReaders = `oidc:${name(nameLength).name}-platform-readers`;

    const bindings: Omit<FixtureRbacBinding, 'installation' | 'createdAt'>[] = [
      {
        kind: 'ClusterRoleBinding',
        name: 'platform-admins',
        role: { kind: 'ClusterRole', name: 'cluster-admin' },
        subjects: [
          { kind: 'Group', name: platformAdmins },
          { kind: 'User', name: person() },
        ],
      },
      {
        kind: 'ClusterRoleBinding',
        name: 'platform-readers',
        role: { kind: 'ClusterRole', name: 'read-all' },
        subjects: [{ kind: 'Group', name: platformReaders }],
      },
      {
        kind: 'ClusterRoleBinding',
        name: 'automation-read-all',
        role: { kind: 'ClusterRole', name: 'read-all' },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: 'automation',
            namespace: 'default',
          },
        ],
      },
    ];

    const organizations = [
      ...new Set(
        clusters
          .filter(
            c => c.installation === installation.name && c.kind === 'workload',
          )
          .map(c => c.organization),
      ),
    ];
    organizations.forEach((organization, turn) => {
      const namespace = `org-${organization}`;
      const readers = `oidc:${organization}-readers`;
      bindings.push(
        {
          kind: 'RoleBinding',
          name: `organization-${organization}-admins`,
          namespace,
          role: { kind: 'ClusterRole', name: 'cluster-admin' },
          subjects: [
            { kind: 'Group', name: `oidc:${organization}-admins` },
            { kind: 'User', name: person() },
          ],
        },
        {
          kind: 'RoleBinding',
          name: `organization-${organization}-deployer`,
          namespace,
          role: { kind: 'ClusterRole', name: 'edit' },
          subjects: [
            {
              kind: 'ServiceAccount',
              name: `${organization}-deployer`,
              namespace,
            },
          ],
        },
        {
          kind: 'RoleBinding',
          name: `organization-${organization}-readers`,
          namespace,
          role: { kind: 'ClusterRole', name: 'view' },
          subjects: [{ kind: 'Group', name: readers }],
        },
      );
      // The readers see the next organization's namespace too: a subject
      // with access in several namespaces.
      const next = organizations[(turn + 1) % organizations.length];
      if (next !== organization) {
        bindings.push({
          kind: 'RoleBinding',
          name: `organization-${next}-guest-readers`,
          namespace: `org-${next}`,
          role: { kind: 'ClusterRole', name: 'view' },
          subjects: [{ kind: 'Group', name: readers }],
        });
      }
    });

    for (let i = 0; i < count; i++) {
      const organization =
        organizations.length > 0
          ? organizations[i % organizations.length]
          : undefined;
      const user = person();
      bindings.push({
        kind: 'RoleBinding',
        name: fitName(`view-${user.split('@')[0]}`, MAX_NAME_LENGTH),
        namespace: organization ? `org-${organization}` : 'default',
        role: { kind: 'ClusterRole', name: 'view' },
        subjects: [{ kind: 'User', name: user }],
      });
    }

    return [...system, ...bindings.map(inInstallation)];
  });
}

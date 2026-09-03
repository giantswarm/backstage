import {
  ClusterRoleBinding,
  RbacRoleRef,
  RbacSubject,
  RoleBinding,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export interface RbacBindingInfo {
  bindingKind: 'RoleBinding' | 'ClusterRoleBinding';
  bindingName: string;
  roleKind: RbacRoleRef['kind'];
  roleName: string;
  /** Namespace the binding grants access in; undefined means cluster-wide. */
  namespace?: string;
}

export interface RbacSubjectRow {
  id: string;
  kind: RbacSubject['kind'];
  name: string;
  /** Only set for ServiceAccount subjects. */
  namespace?: string;
  isSystem: boolean;
  clusterWide: boolean;
  namespaces: string[];
  roles: string[];
  bindings: RbacBindingInfo[];
  /** Precomputed for the table's built-in search. */
  rolesText: string;
  scopeText: string;
}

export function isSystemSubject(subject: RbacSubject): boolean {
  return (
    subject.name.startsWith('system:') ||
    Boolean(subject.namespace?.startsWith('kube-'))
  );
}

function formatScope(clusterWide: boolean, namespaces: string[]): string {
  const parts = [];
  if (clusterWide) {
    parts.push('Cluster-wide');
  }
  parts.push(...namespaces);

  return parts.join(', ');
}

/**
 * Groups RBAC bindings by subject, so each row answers "who can do what,
 * where" for one user, group or service account.
 */
export function buildRbacSubjectRows(
  roleBindings: RoleBinding[],
  clusterRoleBindings: ClusterRoleBinding[],
): RbacSubjectRow[] {
  const rows = new Map<string, RbacSubjectRow>();

  const add = (subject: RbacSubject, binding: RbacBindingInfo) => {
    const id = [subject.kind, subject.namespace, subject.name].join('/');

    let row = rows.get(id);
    if (!row) {
      row = {
        id,
        kind: subject.kind,
        name: subject.name,
        namespace: subject.namespace,
        isSystem: isSystemSubject(subject),
        clusterWide: false,
        namespaces: [],
        roles: [],
        bindings: [],
        rolesText: '',
        scopeText: '',
      };
      rows.set(id, row);
    }

    row.bindings.push(binding);
    if (!row.roles.includes(binding.roleName)) {
      row.roles.push(binding.roleName);
    }
    if (binding.namespace) {
      if (!row.namespaces.includes(binding.namespace)) {
        row.namespaces.push(binding.namespace);
      }
    } else {
      row.clusterWide = true;
    }
  };

  for (const binding of clusterRoleBindings) {
    for (const subject of binding.getSubjects()) {
      add(subject, {
        bindingKind: 'ClusterRoleBinding',
        bindingName: binding.getName(),
        roleKind: binding.getRoleRef().kind,
        roleName: binding.getRoleRef().name,
      });
    }
  }

  for (const binding of roleBindings) {
    for (const subject of binding.getSubjects()) {
      add(subject, {
        bindingKind: 'RoleBinding',
        bindingName: binding.getName(),
        roleKind: binding.getRoleRef().kind,
        roleName: binding.getRoleRef().name,
        namespace: binding.getNamespace(),
      });
    }
  }

  const kindOrder: Record<RbacSubjectRow['kind'], number> = {
    Group: 0,
    User: 1,
    ServiceAccount: 2,
  };

  return [...rows.values()]
    .map(row => ({
      ...row,
      namespaces: row.namespaces.sort(),
      rolesText: row.roles.join(', '),
      scopeText: formatScope(row.clusterWide, row.namespaces),
    }))
    .sort(
      (a, b) =>
        kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name),
    );
}

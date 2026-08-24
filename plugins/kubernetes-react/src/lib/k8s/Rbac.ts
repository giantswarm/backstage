import { core } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

export interface RbacSubject {
  kind: 'User' | 'Group' | 'ServiceAccount';
  apiGroup?: string;
  name: string;
  namespace?: string;
}

export interface RbacRoleRef {
  apiGroup: string;
  kind: 'Role' | 'ClusterRole';
  name: string;
}

export interface RbacPolicyRule {
  apiGroups?: string[];
  resources?: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
  verbs: string[];
}

interface RoleInterface {
  kind: string;
  apiVersion: string;
  metadata: core.metav1.ObjectMeta;
  rules?: RbacPolicyRule[] | null;
}

interface ClusterRoleInterface extends RoleInterface {
  aggregationRule?: {
    clusterRoleSelectors?: { matchLabels?: Record<string, string> }[];
  };
}

interface BindingInterface {
  kind: string;
  apiVersion: string;
  metadata: core.metav1.ObjectMeta;
  subjects?: RbacSubject[] | null;
  roleRef: RbacRoleRef;
}

const RBAC_GROUP = 'rbac.authorization.k8s.io';

export class Role extends KubeObject<RoleInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'Role' as const;
  static readonly group = RBAC_GROUP;
  static readonly plural = 'roles';

  getRules() {
    return this.jsonData.rules ?? [];
  }
}

export class ClusterRole extends KubeObject<ClusterRoleInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'ClusterRole' as const;
  static readonly group = RBAC_GROUP;
  static readonly plural = 'clusterroles';

  getRules() {
    return this.jsonData.rules ?? [];
  }
}

export class RoleBinding extends KubeObject<BindingInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'RoleBinding' as const;
  static readonly group = RBAC_GROUP;
  static readonly plural = 'rolebindings';

  getSubjects() {
    return this.jsonData.subjects ?? [];
  }

  getRoleRef() {
    return this.jsonData.roleRef;
  }
}

export class ClusterRoleBinding extends KubeObject<BindingInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'ClusterRoleBinding' as const;
  static readonly group = RBAC_GROUP;
  static readonly plural = 'clusterrolebindings';

  getSubjects() {
    return this.jsonData.subjects ?? [];
  }

  getRoleRef() {
    return this.jsonData.roleRef;
  }
}

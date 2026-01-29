import { core } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type NamespaceInterface = core.v1.Namespace;

export class Namespace extends KubeObject<NamespaceInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'Namespace' as const;
  static readonly plural = 'namespaces';
  static readonly isCore = true;
}

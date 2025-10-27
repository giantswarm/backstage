import { core } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type NamespaceInterface = core.v1.Namespace;

export class Namespace extends KubeObject<NamespaceInterface> {
  static kind = 'Namespace' as const;
  static plural = 'namespaces';
  static isCore = true;
}

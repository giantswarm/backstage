import { KubeObject } from './KubeObject';

export class Namespace extends KubeObject {
  static kind = 'Namespace' as const;
  static plural = 'namespaces';
  static isCore = true;
}

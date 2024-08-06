import { IObjectMeta } from '../metav1/types';

export interface ISecretStore {
  apiVersion: string;
  kind: string;
  metadata: IObjectMeta;
}

export interface IClusterSecretStore {
  apiVersion: string;
  kind: string;
  metadata: IObjectMeta;
}

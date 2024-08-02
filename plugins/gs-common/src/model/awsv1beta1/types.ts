import { IObjectMeta } from '../metav1/types';

export interface IProviderConfig {
  apiVersion: string;
  kind: string;
  metadata: IObjectMeta;
}

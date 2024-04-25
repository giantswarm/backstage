import { IObjectMeta } from '../metav1/types';

export interface IOrganizationSpec {}

export interface IOrganizationStatus {
  namespace?: string;
}

export interface IOrganization {
  apiVersion: string;
  kind: string;
  metadata: IObjectMeta;
  spec: IOrganizationSpec;
  status?: IOrganizationStatus;
}

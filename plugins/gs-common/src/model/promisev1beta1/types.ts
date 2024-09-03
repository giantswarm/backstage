import { IObjectMeta } from '../metav1/types';

export interface IGitHubApp {
  apiVersion: string;
  kind: 'githubapp';
  metadata: IObjectMeta;
  status?: IResourceRequestStatus;
}

export interface IGitHubRepo {
  apiVersion: string;
  kind: 'githubrepo';
  metadata: IObjectMeta;
  status?: IResourceRequestStatus;
}

export interface IAppDeployment {
  apiVersion: string;
  kind: 'appdeployment';
  metadata: IObjectMeta;
  status?: IResourceRequestStatus;
}

interface IResourceRequestStatus {
  conditions?: {
    lastTransitionTime: string;
    message?: string;
    reason?: string;
    status: string;
    type: string;
  }[];
  message?: string;
}

import * as v1beta1 from './v1beta1';

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

type ResourceRequest<T extends {}> = T & {
  status?: IResourceRequestStatus;
};

export type GitHubApp = ResourceRequest<v1beta1.IGitHubApp>;

export type GitHubRepo = ResourceRequest<v1beta1.IGitHubRepo>;

export type AppDeployment = ResourceRequest<v1beta1.IAppDeployment>;

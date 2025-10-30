import { crds } from '@giantswarm/k8s-types';
import { ResourceRequest } from './ResourceRequest';

type GitHubRepoInterface = crds.giantswarm.v1beta1.GitHubRepo;

export class GitHubRepo extends ResourceRequest<GitHubRepoInterface> {
  static apiVersion = 'v1beta1';
  static group = 'promise.platform.giantswarm.io';
  static kind = 'GitHubRepo' as const;
  static plural = 'githubrepos';
}

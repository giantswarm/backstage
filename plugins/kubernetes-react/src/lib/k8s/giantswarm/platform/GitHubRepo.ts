import { crds } from '@giantswarm/k8s-types';
import { ResourceRequest } from './ResourceRequest';

type GitHubRepoInterface = crds.giantswarm.v1beta1.GitHubRepo;

export class GitHubRepo extends ResourceRequest<GitHubRepoInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'promise.platform.giantswarm.io';
  static readonly kind = 'GitHubRepo' as const;
  static readonly plural = 'githubrepos';
}

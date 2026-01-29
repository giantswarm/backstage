import { crds } from '@giantswarm/k8s-types';
import { ResourceRequest } from './ResourceRequest';

type GitHubAppInterface = crds.giantswarm.v1beta1.GitHubApp;

export class GitHubApp extends ResourceRequest<GitHubAppInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'promise.platform.giantswarm.io';
  static readonly kind = 'GitHubApp' as const;
  static readonly plural = 'githubapps';
}

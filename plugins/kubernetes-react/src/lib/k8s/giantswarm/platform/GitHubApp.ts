import { crds } from '@giantswarm/k8s-types';
import { ResourceRequest } from './ResourceRequest';

type GitHubAppInterface = crds.giantswarm.v1beta1.GitHubApp;

export class GitHubApp extends ResourceRequest<GitHubAppInterface> {
  static apiVersion = 'v1beta1';
  static group = 'promise.platform.giantswarm.io';
  static kind = 'GitHubApp' as const;
  static plural = 'githubapps';
}

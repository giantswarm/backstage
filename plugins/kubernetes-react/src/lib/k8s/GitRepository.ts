import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type GitRepositoryInterface = crds.fluxcd.v1.GitRepository;

export class GitRepository extends FluxObject<GitRepositoryInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'source.toolkit.fluxcd.io';
  static readonly kind = 'GitRepository' as const;
  static readonly plural = 'gitrepositories';

  getURL() {
    return this.jsonData.spec?.url;
  }

  getReference() {
    return this.jsonData.spec?.ref;
  }

  getRevision() {
    return this.jsonData.status?.artifact?.revision;
  }
}

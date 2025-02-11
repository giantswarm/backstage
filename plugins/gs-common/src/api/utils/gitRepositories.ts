import * as fluxcd from '../../model/fluxcd';
import { GitRepository } from '../types';

export { GitRepositoryKind, GitRepositoryNames } from '../../model/fluxcd';

export function getGitRepositoryNames() {
  return fluxcd.GitRepositoryNames;
}

export function getGitRepositoryKind() {
  return fluxcd.GitRepositoryKind;
}

export function getGitRepositoryGVK(apiVersion?: string) {
  const gvk = fluxcd.getGitRepositoryGVK(apiVersion);
  const kind = fluxcd.GitRepositoryKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getGitRepositoryUrl(gitRepository: GitRepository) {
  return gitRepository.spec?.url;
}

export function getGitRepositoryRevision(gitRepository: GitRepository) {
  const revision = gitRepository.status?.artifact?.revision;

  return revision ? revision.split('sha1:')[1] : undefined;
}

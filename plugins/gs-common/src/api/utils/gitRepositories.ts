import * as fluxcd from '../../model/fluxcd';
import { GitRepository } from '../types';

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
  const spec = gitRepository.spec;
  if (!spec) {
    return undefined;
  }

  const url = new URL(spec.url);

  if (url.protocol === 'ssh:') {
    const hostname = url.hostname.replace(/^ssh\./, '');
    const pathname = url.pathname.replace(/\.git$/, '');

    return `https://${hostname}${pathname}`;
  }

  return url.toString();
}

export function getGitRepositoryRevision(gitRepository: GitRepository) {
  const revision = gitRepository.status?.artifact?.revision;

  return revision ? revision.split('sha1:')[1] : undefined;
}

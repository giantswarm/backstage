import {
  getGitRepositoryGVK,
  getGitRepositoryNames,
  type GitRepository,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';
import { getErrorMessage } from './utils/helpers';

export function useGitRepository(
  {
    installationName,
    name,
    namespace,
  }: {
    installationName: string;
    name: string;
    namespace?: string;
  },
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const apiVersion = useApiVersionOverride(
    installationName,
    getGitRepositoryNames(),
  );
  const gvk = getGitRepositoryGVK(apiVersion);

  const query = useGetResource<GitRepository>(
    { installationName, gvk, name, namespace },
    { enabled },
  );

  return {
    ...query,
    queryErrorMessage: getErrorMessage({
      error: query.error,
      resourceKind: 'GitRepository',
      resourceName: name,
      resourceNamespace: namespace,
    }),
  };
}

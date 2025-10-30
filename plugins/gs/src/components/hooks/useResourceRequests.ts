import {
  AppDeployment,
  GitHubApp,
  GitHubRepo,
  ResourceRequest,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMemo } from 'react';

export function useResourceRequests(
  kratixResources: {
    installationName: string;
    kind: string;
    name: string;
    namespace: string;
  }[],
) {
  const appDeploymentRef = kratixResources.find(
    resource => resource.kind === 'appdeployment',
  );

  const {
    resource: appDeployment,
    isLoading: isLoadingAppDeployment,
    error: appDeploymentError,
    refetch: appDeploymentRefetch,
  } = useResource(
    appDeploymentRef!.installationName,
    AppDeployment,
    { name: appDeploymentRef!.name, namespace: appDeploymentRef!.namespace },
    { enabled: Boolean(appDeploymentRef) },
  );

  const githubAppRef = kratixResources.find(
    resource => resource.kind === 'githubapp',
  );

  const {
    resource: githubApp,
    isLoading: isLoadingGithubApp,
    error: githubAppError,
    refetch: githubAppRefetch,
  } = useResource(
    githubAppRef!.installationName,
    GitHubApp,
    { name: githubAppRef!.name, namespace: githubAppRef!.namespace },
    { enabled: Boolean(githubAppRef) },
  );

  const githubRepoRef = kratixResources.find(
    resource => resource.kind === 'githubrepo',
  );
  const {
    resource: githubRepo,
    isLoading: isLoadingGithubRepo,
    error: githubRepoError,
    refetch: githubRepoRefetch,
  } = useResource(
    githubRepoRef!.installationName,
    GitHubRepo,
    { name: githubRepoRef!.name, namespace: githubRepoRef!.namespace },
    { enabled: Boolean(githubRepoRef) },
  );

  return useMemo(() => {
    const resources = [appDeployment, githubApp, githubRepo].filter(
      Boolean,
    ) as ResourceRequest[];
    const isLoading =
      isLoadingAppDeployment || isLoadingGithubApp || isLoadingGithubRepo;
    const error = appDeploymentError || githubAppError || githubRepoError;
    const retry = () => {
      appDeploymentRefetch();
      githubAppRefetch();
      githubRepoRefetch();
    };

    return {
      resources,
      isLoading,
      error,
      retry,
    };
  }, [
    appDeployment,
    githubApp,
    githubRepo,
    isLoadingAppDeployment,
    isLoadingGithubApp,
    isLoadingGithubRepo,
    appDeploymentError,
    githubAppError,
    githubRepoError,
    appDeploymentRefetch,
    githubAppRefetch,
    githubRepoRefetch,
  ]);
}

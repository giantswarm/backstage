import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import {
  getKubernetesAPIAccessCommand,
  TSH_INSTALLATION_DOCS_URL,
  TSH_LOGIN_COMMAND,
} from '../../clusters/cluster-details/ClusterOverview/ClusterAccessCard/ClusterAccessGS/utils';
import {
  getKubectlGsLoginCommand,
  isManagementCluster,
} from '../../clusters/utils';
import { useCurrentUser, useInstallationsInfo } from '../../hooks';

/** The commands that log in to a cluster, as its access section shows them. */
export type ClusterLoginCommands = {
  /** `kubectl gs login`, where the installation's base domain is known. */
  kubectlGs?: string;
  /**
   * For Giant Swarm staff: `tsh kube login`, with the one-time tsh setup.
   */
  staff?: { command: string; setup: string; installDocsUrl: string };
  /**
   * Whether the person is Giant Swarm staff (`useCurrentUser`): undefined
   * while their installation token is read, or when it could not be.
   */
  isGSUser: boolean | undefined;
  /** Whether the person's installation token is still being read. */
  isUserLoading: boolean;
};

/**
 * The current cluster's login commands, built as the classic cluster page's
 * Kubernetes API access card builds them: `kubectl gs login` for everyone
 * where the base domain is known, and the Teleport command for a person whose
 * installation token puts them in `gs.adminGroups` (`useCurrentUser`).
 */
export function useClusterLoginCommands(): ClusterLoginCommands {
  const { cluster, installationName } = useCurrentCluster();
  const { installationsInfo } = useInstallationsInfo();
  const { isGSUser, isLoading: isUserLoading } =
    useCurrentUser(installationName);
  const baseDomain = installationsInfo.find(
    info => info.name === installationName,
  )?.baseDomain;
  return {
    isGSUser,
    isUserLoading,
    ...(baseDomain && {
      kubectlGs: getKubectlGsLoginCommand(
        baseDomain,
        cluster.getName(),
        isManagementCluster(cluster),
      ),
    }),
    ...(isGSUser && {
      staff: {
        command: getKubernetesAPIAccessCommand(
          cluster.getName(),
          installationName,
        ),
        setup: TSH_LOGIN_COMMAND,
        installDocsUrl: TSH_INSTALLATION_DOCS_URL,
      },
    }),
  };
}

import { useCallback, useState } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';

const DEFAULT_DEPLOY_TEMPLATE_REF = 'template:default/agent-deployment';

export type DeployAgentInput = {
  /** Installation / management cluster to apply the manifest to. */
  installation: string;
  /** The multi-document manifest to apply (composeManifests().combinedManifest). */
  manifest: string;
  /** HelmRelease name — only used to build the task's result link. */
  releaseName: string;
  /** Namespace the resources land in — only used for the result link. */
  namespace: string;
};

export type DeployStatus =
  | { phase: 'idle' }
  | { phase: 'authenticating' }
  | { phase: 'submitting' }
  | { phase: 'done'; taskId: string }
  | { phase: 'error'; error: Error };

/**
 * Applies the composed agent manifest directly to the selected installation via
 * the `kube:apply` scaffolder action (no pull request).
 *
 * It mints the user's per-installation OIDC token the same way the `GSOIDCToken`
 * scaffolder field does — `kubernetesApi.getCluster()` →
 * `kubernetesAuthProvidersApi.getCredentials()` — then drives the hidden
 * `agent-deployment` template through `scaffolderApi.scaffold()`, passing the
 * token as the `USER_OIDC_TOKEN` secret. `oidcTokenInstallation` in the values
 * tells the GS scaffolder client which installation backend to route the task
 * to.
 */
export function useDeployAgent() {
  const scaffolderApi = useApi(scaffolderApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);
  const configApi = useApi(configApiRef);
  const [status, setStatus] = useState<DeployStatus>({ phase: 'idle' });

  const deploy = useCallback(
    async ({
      installation,
      manifest,
      releaseName,
      namespace,
    }: DeployAgentInput): Promise<string> => {
      try {
        setStatus({ phase: 'authenticating' });

        const cluster = await kubernetesApi.getCluster(installation);
        if (!cluster) {
          throw new Error(
            `Installation "${installation}" is not known to the Kubernetes API.`,
          );
        }

        const { authProvider, oidcTokenProvider } = cluster;
        const { token } = await kubernetesAuthProvidersApi.getCredentials(
          authProvider === 'oidc'
            ? `${authProvider}.${oidcTokenProvider}`
            : authProvider,
        );
        if (!token) {
          throw new Error(
            `Could not obtain an access token for "${installation}". You may need to log in to that installation first.`,
          );
        }

        setStatus({ phase: 'submitting' });

        const templateRef =
          configApi.getOptionalString('agentPlatform.deployTemplateRef') ??
          DEFAULT_DEPLOY_TEMPLATE_REF;

        const { taskId } = await scaffolderApi.scaffold({
          templateRef,
          values: {
            manifest,
            clusterName: installation,
            releaseName,
            namespace,
            // Read by the GS ScaffolderApiClient to route the task to this
            // installation's backend.
            oidcTokenInstallation: installation,
          },
          secrets: { USER_OIDC_TOKEN: token },
        });

        setStatus({ phase: 'done', taskId });
        return taskId;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        setStatus({ phase: 'error', error });
        throw error;
      }
    },
    [scaffolderApi, kubernetesApi, kubernetesAuthProvidersApi, configApi],
  );

  return { deploy, status };
}

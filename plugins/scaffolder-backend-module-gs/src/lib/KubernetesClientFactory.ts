import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { KubeConfig, KubernetesObjectApi } from '@kubernetes/client-node';

/**
 * Builds Kubernetes clients for the clusters declared under
 * `kubernetes.clusterLocatorMethods` (type `config`) in app-config.
 *
 * Clusters with `authProvider: oidc` authenticate with the per-task user token
 * passed to the scaffolder action; `serviceAccount` clusters use their static
 * token. When no matching cluster is configured (or an OIDC cluster gets no
 * token) the default kubeconfig is used, which inside a pod means the
 * in-cluster service account.
 */
export class KubernetesClientFactory {
  private readonly configuredClusters = new Map<string, KubeConfig>();
  private readonly logger: LoggerService;

  constructor(options: { logger: LoggerService; config: Config }) {
    this.logger = options.logger;
    this.initializeClusters(options.config);
  }

  private initializeClusters(config: Config) {
    if (!config.has('kubernetes')) {
      this.logger.info(
        'No Kubernetes configuration found in app-config, will use default kubeconfig',
      );
      return;
    }

    const locatorConfigs =
      config.getOptionalConfigArray('kubernetes.clusterLocatorMethods') ?? [];
    for (const locatorConfig of locatorConfigs) {
      const type = locatorConfig.getString('type');
      if (type !== 'config') {
        this.logger.info(
          `Cluster locator type "${type}" is not supported for scaffolder Kubernetes actions`,
        );
        continue;
      }

      for (const clusterConfig of locatorConfig.getConfigArray('clusters')) {
        const name = clusterConfig.getString('name');
        const authProvider = clusterConfig.getString('authProvider');

        const kubeConfig = new KubeConfig();
        kubeConfig.addCluster({
          name,
          server: clusterConfig.getString('url'),
          skipTLSVerify:
            clusterConfig.getOptionalBoolean('skipTLSVerify') ?? false,
          caData: clusterConfig.getOptionalString('caData'),
          caFile: clusterConfig.getOptionalString('caFile'),
        });

        switch (authProvider) {
          case 'serviceAccount':
            kubeConfig.addUser({
              name,
              token: clusterConfig.getString('serviceAccountToken'),
            });
            break;
          case 'oidc':
            kubeConfig.addUser({ name, authProvider: 'oidc' });
            break;
          default:
            this.logger.warn(
              `Unsupported auth provider "${authProvider}" for cluster "${name}", falling back to default credentials`,
            );
            kubeConfig.addUser({ name });
            break;
        }

        kubeConfig.addContext({ name, cluster: name, user: name });
        kubeConfig.setCurrentContext(name);
        this.configuredClusters.set(name, kubeConfig);
        this.logger.info(`Added Kubernetes cluster "${name}" from app-config`);
      }
    }

    this.logger.info(
      `Initialized ${this.configuredClusters.size} Kubernetes clusters from config`,
    );
  }

  /**
   * Gets a kubeconfig for the requested cluster, defaulting to the first
   * configured cluster. OIDC clusters are cloned with the provided user token.
   */
  getKubeConfig(options?: { clusterName?: string; token?: string }) {
    const clusterName =
      options?.clusterName ??
      this.configuredClusters.keys().next().value ??
      undefined;
    if (!clusterName) {
      return this.getFallbackKubeConfig('No configured clusters available');
    }

    const kubeConfig = this.configuredClusters.get(clusterName);
    if (!kubeConfig) {
      return this.getFallbackKubeConfig(
        `No configuration found for Kubernetes cluster "${clusterName}"`,
      );
    }

    if (kubeConfig.getCurrentUser()?.authProvider === 'oidc') {
      return this.getOidcKubeConfig(kubeConfig, clusterName, options?.token);
    }

    this.logger.info(
      `Using Kubernetes configuration for cluster "${clusterName}"`,
    );
    return kubeConfig;
  }

  /** Gets a client that works with any Kubernetes resource type. */
  getObjectsClient(options?: { clusterName?: string; token?: string }) {
    return KubernetesObjectApi.makeApiClient(this.getKubeConfig(options));
  }

  private getFallbackKubeConfig(reason: string) {
    this.logger.info(`${reason}, falling back to default kubeconfig`);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromDefault();
    return kubeConfig;
  }

  private getOidcKubeConfig(
    kubeConfig: KubeConfig,
    clusterName: string,
    token?: string,
  ) {
    if (!token) {
      return this.getFallbackKubeConfig(
        `No user token provided for OIDC cluster "${clusterName}"`,
      );
    }
    const cluster = kubeConfig.getCluster(clusterName);
    if (!cluster) {
      return this.getFallbackKubeConfig(
        `No cluster configuration found for OIDC cluster "${clusterName}"`,
      );
    }

    const oidcKubeConfig = new KubeConfig();
    oidcKubeConfig.addCluster(cluster);
    oidcKubeConfig.addUser({ name: cluster.name, token });
    oidcKubeConfig.addContext({
      name: cluster.name,
      cluster: cluster.name,
      user: cluster.name,
    });
    oidcKubeConfig.setCurrentContext(cluster.name);
    return oidcKubeConfig;
  }
}

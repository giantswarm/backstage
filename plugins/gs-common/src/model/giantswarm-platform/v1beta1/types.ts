/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * A combo of AppDeloyment and GithubRepo
 */
export interface IGitHubApp {
  spec?: {
    githubRepo: {
      /**
       * A name for the githubrepo object.
       */
      name: string;
      spec: {
        /**
         * Backstage catalog entity configuration
         */
        backstageCatalogEntity: {
          /**
           * A reference of the owning Backstage entity.
           */
          owner: string;
          /**
           * A lifecycle of the Backstage entity.
           */
          lifecycle: string;
        };
        /**
         * New repository configuration.
         */
        repository: {
          /**
           * A name of the owning GitHub organization or user.
           */
          owner: string;
          /**
           * A name for the new repository.
           */
          name: string;
          /**
           * A description of the new repository.
           */
          description: string;
          /**
           * A full name (`user/repository`) of a GitHub template repository to use.
           */
          templateSource: string;
          /**
           * Visibility of the created repo.
           */
          visibility: 'public' | 'internal' | 'private';
        };
        /**
         * The name and namespace of a Secret that has a key named "gh_token" with value if a GitHub authentication token used to create a new repository.
         */
        githubTokenSecretRef?: {
          /**
           * Object name.
           */
          name: string;
          /**
           * Object's namespace.
           */
          namespace?: string;
        };
        /**
         * The name and namespace of a ConfigMap that has keys named "registry_domain",  "registry_username" and "registry_cicd_secret_ref" that configure access to  the image registry in the CICD GitHib Action.
         */
        registryInfoConfigMapRef: {
          /**
           * Object name.
           */
          name: string;
          /**
           * Object's namespace.
           */
          namespace?: string;
        };
      };
    };
    appDeployment: {
      /**
       * A name for the appdeployment object.
       */
      name: string;
      /**
       * AppDeploymentSpec defines the desired state of a Helm release and Logical Database.
       */
      spec: {
        /**
         * Logical database related information.
         */
        database: {
          /**
           * Database engine of the referenced database cluster.
           */
          engine: string;
          /**
           * ESO related configuration.
           */
          eso: {
            /**
             * Field name that indicates the database cluster being ready in the Flux SSA secret.
             */
            clusterSsaField: string;
            /**
             * Tenant cluster related configuration.
             */
            tenantCluster?: {
              /**
               * URL of the tenant cluster API servers.
               */
              apiServerEndpoint?: string;
              /**
               * Name of the tenant workload cluster.
               */
              clusterName?: string;
              /**
               * Switch for the tenant cluster configuration.
               */
              enabled?: boolean;
            };
          };
          /**
           * Database provider config reference information.
           */
          providerConfigRef: {
            /**
             * Name of the provider config reference object for the given database engine.
             */
            name: string;
          };
        };
        /**
         * DependsOn may contain a meta.NamespacedObjectReference slice with
         * references to AppDeployment resources that must be ready before this AppDeployment
         * can be reconciled.
         */
        dependsOn?: {
          /**
           * Name of the referent.
           */
          name: string;
          /**
           * Namespace of the referent, when not specified it acts as LocalObjectReference.
           */
          namespace?: string;
        }[];
        /**
         * Interval at which to reconcile the Helm release.
         */
        interval: string;
        /**
         * FQDN to use for the hostname of the service
         */
        ingressHost?: string;
        /**
         * KubeConfig for reconciling the HelmRelease on a remote cluster.
         * When used in combination with HelmReleaseSpec.ServiceAccountName,
         * forces the controller to act on behalf of that Service Account at the
         * target cluster.
         * If the --default-service-account flag is set, its value will be used as
         * a controller level fallback for when HelmReleaseSpec.ServiceAccountName
         * is empty.
         */
        kubeConfig?: {
          /**
           * SecretRef holds the name of a secret that contains a key with
           * the kubeconfig file as the value. If no key is set, the key will default
           * to 'value'.
           * It is recommended that the kubeconfig is self-contained, and the secret
           * is regularly updated if credentials such as a cloud-access-token expire.
           * Cloud specific `cmd-path` auth helpers will not function without adding
           * binaries and credentials to the Pod that is responsible for reconciling
           * Kubernetes resources.
           */
          secretRef: {
            /**
             * Key in the Secret, when not specified an implementation-specific default key is used.
             */
            key?: string;
            /**
             * Name of the Secret.
             */
            name: string;
          };
        };
        /**
         * The name of the Kubernetes service account to impersonate when reconciling this HelmRelease.
         */
        serviceAccountName?: string;
        /**
         * ReleaseName used for the Helm release.
         */
        releaseName?: string;
        /**
         * TargetNamespace to target when performing operations for the HelmRelease. Defaults to the namespace of the HelmRelease.
         */
        storageNamespace?: string;
        /**
         * StorageNamespace used for the Helm storage. Defaults to the namespace of the HelmRelease.
         */
        targetNamespace?: string;
        /**
         * Suspend tells the controller to suspend reconciliation for this AppDeployment,
         * it does not apply to already started reconciliations. Defaults to false.
         */
        suspend?: boolean;
        /**
         * Timeout when reconciling the Helm release.
         */
        timeout?: string;
        /**
         * Values holds the values for this Helm release.
         */
        values?: {
          [k: string]: unknown;
        };
        /**
         * ValuesFrom holds references to resources containing Helm values for this AppDeployment,
         * and information about how they should be merged.
         */
        valuesFrom?: {
          /**
           * Kind of the values referent, valid values are ('Secret', 'ConfigMap').
           */
          kind: 'Secret' | 'ConfigMap';
          /**
           * Name of the values referent. Should reside in the same namespace as the
           * referring resource.
           */
          name: string;
          /**
           * Optional marks this ValuesReference as optional. When set, a not found error
           * for the values reference is ignored, but any ValuesKey, TargetPath or
           * transient error will still result in a reconciliation failure.
           */
          optional?: boolean;
          /**
           * TargetPath is the YAML dot notation path the value should be merged at. When
           * set, the ValuesKey is expected to be a single flat value. Defaults to 'None',
           * which results in the values getting merged at the root.
           */
          targetPath?: string;
          /**
           * ValuesKey is the data key where the values.yaml or a specific value can be
           * found at. Defaults to 'values.yaml'.
           */
          valuesKey?: string;
        }[];
        /**
         * Version semver expression, ignored for charts from v1.GitRepository and
         * v1beta2.Bucket sources. Defaults to latest when omitted.
         */
        version?: string;
      };
    };
  };
  apiVersion: 'v1beta1';
  metadata: metav1.IObjectMeta;
  kind: 'GitHubApp';
}

export interface IGitHubRepo {
  spec?: {
    /**
     * Backstage catalog entity configuration
     */
    backstageCatalogEntity: {
      /**
       * A reference of the owning Backstage entity.
       */
      owner: string;
      /**
       * A lifecycle of the Backstage entity.
       */
      lifecycle: string;
    };
    /**
     * New repository configuration.
     */
    repository: {
      /**
       * A name of the owning GitHub organization or user.
       */
      owner: string;
      /**
       * A name for the new repository.
       */
      name: string;
      /**
       * A description of the new repository.
       */
      description: string;
      /**
       * A full name (`user/repository`) of a GitHub template repository to use.
       */
      templateSource: string;
      /**
       * Visibility of the created repo.
       */
      visibility: 'public' | 'internal' | 'private';
    };
    /**
     * The name and namespace of a Secret that has a key named "gh_token" with value if a GitHub authentication token used to create a new repository.
     */
    githubTokenSecretRef?: {
      /**
       * Object name.
       */
      name: string;
      /**
       * Object's namespace.
       */
      namespace?: string;
    };
    /**
     * The name and namespace of a ConfigMap that has keys named "registry_domain",  "registry_username" and "registry_cicd_secret_ref" that configure access to  the image registry in the CICD GitHib Action.
     */
    registryInfoConfigMapRef: {
      /**
       * Object name.
       */
      name: string;
      /**
       * Object's namespace.
       */
      namespace?: string;
    };
  };
  apiVersion: 'v1beta1';
  metadata: metav1.IObjectMeta;
  kind: 'GitHubRepo';
}

/**
 * AppDeployment
 */
export interface IAppDeployment {
  /**
   * AppDeploymentSpec defines the desired state of a Helm release and Logical Database.
   */
  spec?: {
    /**
     * Logical database related information.
     */
    database: {
      /**
       * Database engine of the referenced database cluster.
       */
      engine: string;
      /**
       * ESO related configuration.
       */
      eso: {
        /**
         * Field name that indicates the database cluster being ready in the Flux SSA secret.
         */
        clusterSsaField: string;
        /**
         * Tenant cluster related configuration.
         */
        tenantCluster?: {
          /**
           * URL of the tenant cluster API servers.
           */
          apiServerEndpoint?: string;
          /**
           * Name of the tenant workload cluster.
           */
          clusterName?: string;
          /**
           * Switch for the tenant cluster configuration.
           */
          enabled?: boolean;
        };
      };
      /**
       * Database provider config reference information.
       */
      providerConfigRef: {
        /**
         * Name of the provider config reference object for the given database engine.
         */
        name: string;
      };
    };
    /**
     * DependsOn may contain a meta.NamespacedObjectReference slice with
     * references to AppDeployment resources that must be ready before this AppDeployment
     * can be reconciled.
     */
    dependsOn?: {
      /**
       * Name of the referent.
       */
      name: string;
      /**
       * Namespace of the referent, when not specified it acts as LocalObjectReference.
       */
      namespace?: string;
    }[];
    /**
     * Interval at which to reconcile the Helm release.
     */
    interval: string;
    /**
     * FQDN to use for the hostname of the service
     */
    ingressHost?: string;
    /**
     * KubeConfig for reconciling the HelmRelease on a remote cluster.
     * When used in combination with HelmReleaseSpec.ServiceAccountName,
     * forces the controller to act on behalf of that Service Account at the
     * target cluster.
     * If the --default-service-account flag is set, its value will be used as
     * a controller level fallback for when HelmReleaseSpec.ServiceAccountName
     * is empty.
     */
    kubeConfig?: {
      /**
       * SecretRef holds the name of a secret that contains a key with
       * the kubeconfig file as the value. If no key is set, the key will default
       * to 'value'.
       * It is recommended that the kubeconfig is self-contained, and the secret
       * is regularly updated if credentials such as a cloud-access-token expire.
       * Cloud specific `cmd-path` auth helpers will not function without adding
       * binaries and credentials to the Pod that is responsible for reconciling
       * Kubernetes resources.
       */
      secretRef: {
        /**
         * Key in the Secret, when not specified an implementation-specific default key is used.
         */
        key?: string;
        /**
         * Name of the Secret.
         */
        name: string;
      };
    };
    /**
     * The name of the Kubernetes service account to impersonate when reconciling this HelmRelease.
     */
    serviceAccountName?: string;
    /**
     * ReleaseName used for the Helm release.
     */
    releaseName?: string;
    /**
     * TargetNamespace to target when performing operations for the HelmRelease. Defaults to the namespace of the HelmRelease.
     */
    storageNamespace?: string;
    /**
     * StorageNamespace used for the Helm storage. Defaults to the namespace of the HelmRelease.
     */
    targetNamespace?: string;
    /**
     * Reference to an already existing 'status' ConfigMap generated by a "*repo" Promise in the same namespace.
     */
    statusConfigMapReference: {
      name: string;
    };
    /**
     * Suspend tells the controller to suspend reconciliation for this AppDeployment,
     * it does not apply to already started reconciliations. Defaults to false.
     */
    suspend?: boolean;
    /**
     * Timeout when reconciling the Helm release.
     */
    timeout?: string;
    /**
     * Values holds the values for this Helm release.
     */
    values?: {
      [k: string]: unknown;
    };
    /**
     * ValuesFrom holds references to resources containing Helm values for this AppDeployment,
     * and information about how they should be merged.
     */
    valuesFrom?: {
      /**
       * Kind of the values referent, valid values are ('Secret', 'ConfigMap').
       */
      kind: 'Secret' | 'ConfigMap';
      /**
       * Name of the values referent. Should reside in the same namespace as the
       * referring resource.
       */
      name: string;
      /**
       * Optional marks this ValuesReference as optional. When set, a not found error
       * for the values reference is ignored, but any ValuesKey, TargetPath or
       * transient error will still result in a reconciliation failure.
       */
      optional?: boolean;
      /**
       * TargetPath is the YAML dot notation path the value should be merged at. When
       * set, the ValuesKey is expected to be a single flat value. Defaults to 'None',
       * which results in the values getting merged at the root.
       */
      targetPath?: string;
      /**
       * ValuesKey is the data key where the values.yaml or a specific value can be
       * found at. Defaults to 'values.yaml'.
       */
      valuesKey?: string;
    }[];
    /**
     * Version semver expression, ignored for charts from v1.GitRepository and
     * v1beta2.Bucket sources. Defaults to latest when omitted.
     */
    version?: string;
  };
  apiVersion: 'v1beta1';
  metadata: metav1.IObjectMeta;
  kind: 'AppDeployment';
}

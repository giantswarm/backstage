/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * App represents a managed app which a user intended to install. It is reconciled by app-operator.
 */
export interface IApp {
  /**
   * APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1alpha1';
  /**
   * Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'App';
  metadata: metav1.IObjectMeta;
  spec?: {
    /**
     * Catalog is the name of the app catalog this app belongs to. e.g. giantswarm
     */
    catalog: string;
    /**
     * CatalogNamespace is the namespace of the Catalog CR this app belongs to. e.g. giantswarm
     */
    catalogNamespace?: string;
    /**
     * Config is the config to be applied when the app is deployed.
     */
    config?: {
      /**
       * ConfigMap references a config map containing values that should be applied to the app.
       */
      configMap?: {
        /**
         * Name is the name of the config map containing app values to apply, e.g. prometheus-values.
         */
        name: string;
        /**
         * Namespace is the namespace of the values config map, e.g. monitoring.
         */
        namespace: string;
      };
      /**
       * Secret references a secret containing secret values that should be applied to the app.
       */
      secret?: {
        /**
         * Name is the name of the secret containing app values to apply, e.g. prometheus-secret.
         */
        name: string;
        /**
         * Namespace is the namespace of the secret, e.g. kube-system.
         */
        namespace: string;
      };
    };
    /**
     * ExtraConfigs is a list of configurations to merge together based on the priority and order in the list. See: https://github.com/giantswarm/rfc/tree/main/multi-layer-app-config#enhancing-app-cr
     */
    extraConfigs?: {
      /**
       * Kind of configuration to look up that should be applied to the app when deployed.
       */
      kind?: 'configMap' | 'secret';
      /**
       * Name of the resource of the given kind to look up.
       */
      name: string;
      /**
       * Namespace where the resource with the given name and kind to look up is located.
       */
      namespace: string;
      /**
       * Priority is used to indicate at which stage the extra configuration should be merged. See: https://github.com/giantswarm/rfc/tree/main/multi-layer-app-config#enhancing-app-cr
       */
      priority?: number;
    }[];
    /**
     * Install is the config used when installing the app.
     */
    install?: {
      /**
       * SkipCRDs when true decides that CRDs which are supplied with the chart are not installed. Default: false.
       */
      skipCRDs?: boolean;
      /**
       * Timeout for the Helm install. When not set the default timeout of 5 minutes is being enforced.
       */
      timeout?: string;
    };
    /**
     * KubeConfig is the kubeconfig to connect to the cluster when deploying the app.
     */
    kubeConfig: {
      /**
       * Deprecated: this field is no longer used.
       */
      context?: {
        /**
         * Name is the name of the kubeconfig context e.g. giantswarm-12345.
         */
        name: string;
      };
      /**
       * InCluster is a flag for whether to use InCluster credentials. When true the context name and secret should not be set.
       */
      inCluster: boolean;
      /**
       * Secret references a secret containing the kubconfig.
       */
      secret?: {
        /**
         * Name is the name of the secret containing the kubeconfig, e.g. app-operator-kubeconfig.
         */
        name: string;
        /**
         * Namespace is the namespace of the secret containing the kubeconfig, e.g. giantswarm.
         */
        namespace: string;
      };
    };
    /**
     * Name is the name of the app to be deployed. e.g. kubernetes-prometheus
     */
    name: string;
    /**
     * Namespace is the target namespace where the app should be deployed e.g. monitoring, it cannot be changed.
     */
    namespace: string;
    /**
     * NamespaceConfig is the namespace config to be applied to the target namespace when the app is deployed.
     */
    namespaceConfig?: {
      /**
       * Annotations is a string map of annotations to apply to the target namespace.
       */
      annotations?: {
        [k: string]: string;
      };
      /**
       * Labels is a string map of labels to apply to the target namespace.
       */
      labels?: {
        [k: string]: string;
      };
    };
    /**
     * Rollback is the config used when rolling back the app.
     */
    rollback?: {
      /**
       * Timeout for the Helm rollback. When not set the default timeout of 5 minutes is being enforced.
       */
      timeout?: string;
    };
    /**
     * Uninstall is the config used when uninstalling the app.
     */
    uninstall?: {
      /**
       * Timeout for the Helm uninstall. When not set the default timeout of 5 minutes is being enforced.
       */
      timeout?: string;
    };
    /**
     * Upgrade is the config used when upgrading the app.
     */
    upgrade?: {
      /**
       * Timeout for the Helm upgrade. When not set the default timeout of 5 minutes is being enforced.
       */
      timeout?: string;
    };
    /**
     * UserConfig is the user config to be applied when the app is deployed.
     */
    userConfig?: {
      /**
       * ConfigMap references a config map containing user values that should be applied to the app.
       */
      configMap?: {
        /**
         * Name is the name of the config map containing user values to apply, e.g. prometheus-user-values.
         */
        name: string;
        /**
         * Namespace is the namespace of the user values config map on the management cluster, e.g. 123ab.
         */
        namespace: string;
      };
      /**
       * Secret references a secret containing user secret values that should be applied to the app.
       */
      secret?: {
        /**
         * Name is the name of the secret containing user values to apply, e.g. prometheus-user-secret.
         */
        name: string;
        /**
         * Namespace is the namespace of the secret, e.g. kube-system.
         */
        namespace: string;
      };
    };
    /**
     * Version is the version of the app that should be deployed. e.g. 1.0.0
     */
    version: string;
  };
  /**
   * Status Spec part of the App resource. Initially, it would be left as empty until the operator successfully reconciles the helm release.
   */
  status?: {
    /**
     * AppVersion is the value of the AppVersion field in the Chart.yaml of the deployed app. This is an optional field with the version of the component being deployed. e.g. 0.21.0. https://helm.sh/docs/topics/charts/#the-chartyaml-file
     */
    appVersion: string;
    /**
     * Release is the status of the Helm release for the deployed app.
     */
    release: {
      /**
       * LastDeployed is the time when the app was last deployed.
       */
      lastDeployed?: string;
      /**
       * Reason is the description of the last status of helm release when the app is not installed successfully, e.g. deploy resource already exists.
       */
      reason?: string;
      /**
       * Status is the status of the deployed app, e.g. DEPLOYED.
       */
      status: string;
    };
    /**
     * Version is the value of the Version field in the Chart.yaml of the deployed app. e.g. 1.0.0.
     */
    version: string;
  };
}

/**
 * Catalog represents a catalog of managed apps. It stores general information for potential apps to install. It is reconciled by app-operator.
 */
export interface ICatalog {
  /**
   * APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1alpha1';
  /**
   * Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'Catalog';
  metadata: metav1.IObjectMeta;
  spec?: {
    /**
     * Config is the config to be applied when apps belonging to this catalog are deployed.
     */
    config?: {
      /**
       * ConfigMap references a config map containing catalog values that should be applied to apps in this catalog.
       */
      configMap?: {
        /**
         * Name is the name of the config map containing catalog values to apply, e.g. app-catalog-values.
         */
        name: string;
        /**
         * Namespace is the namespace of the catalog values config map, e.g. giantswarm.
         */
        namespace: string;
      };
      /**
       * Secret references a secret containing catalog values that should be applied to apps in this catalog.
       */
      secret?: {
        /**
         * Name is the name of the secret containing catalog values to apply, e.g. app-catalog-secret.
         */
        name: string;
        /**
         * Namespace is the namespace of the secret, e.g. giantswarm.
         */
        namespace: string;
      };
    };
    description: string;
    /**
     * LogoURL contains the links for logo image file for this catalog
     */
    logoURL: string;
    /**
     * Repositories is an array of objects defining catalog repositories.
     *
     * @minItems 1
     */
    repositories: [
      {
        /**
         * URL is the link to where this Catalog's repository is located e.g. https://example.com/app-catalog/
         */
        URL: string;
        /**
         * Type indicates which repository type would be used for this Catalog. e.g. helm
         */
        type: string;
      },
      ...{
        /**
         * URL is the link to where this Catalog's repository is located e.g. https://example.com/app-catalog/
         */
        URL: string;
        /**
         * Type indicates which repository type would be used for this Catalog. e.g. helm
         */
        type: string;
      }[],
    ];
    /**
     * Storage references an object defining catalog repository. This field is deprecated and replaced by Repositories.
     */
    storage: {
      /**
       * URL is the link to where this Catalog's repository is located e.g. https://example.com/app-catalog/
       */
      URL: string;
      /**
       * Type indicates which repository type would be used for this Catalog. e.g. helm
       */
      type: string;
    };
    /**
     * Title is the name of the catalog for this CR e.g. Catalog of Apps by Giant Swarm
     */
    title: string;
  };
  /**
   * CatalogStatus represents the current state of the catalog.
   */
  status?: {
    /**
     * HelmRepositoryList contains the list of Flux HelmRepository custom resources that have been successfully created from the Catalog object.
     */
    helmRepositoryList?: {
      /**
       * Entries of HelmRepository custom resources.
       */
      entries: {
        name: string;
        namespace: string;
      }[];
    };
  };
}

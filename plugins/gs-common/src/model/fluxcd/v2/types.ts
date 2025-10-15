/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * HelmRelease is the Schema for the helmreleases API
 */
export interface IHelmRelease {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v2';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'HelmRelease';
  metadata: metav1.IObjectMeta;
  /**
   * HelmReleaseSpec defines the desired state of a Helm release.
   */
  spec?: {
    /**
     * Chart defines the template of the v1.HelmChart that should be created
     * for this HelmRelease.
     */
    chart?: {
      /**
       * ObjectMeta holds the template for metadata like labels and annotations.
       */
      metadata?: {
        /**
         * Annotations is an unstructured key value map stored with a resource that may be
         * set by external tools to store and retrieve arbitrary metadata. They are not
         * queryable and should be preserved when modifying objects.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations/
         */
        annotations?: {
          [k: string]: string;
        };
        /**
         * Map of string keys and values that can be used to organize and categorize
         * (scope and select) objects.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/
         */
        labels?: {
          [k: string]: string;
        };
      };
      /**
       * Spec holds the template for the v1.HelmChartSpec for this HelmRelease.
       */
      spec: {
        /**
         * The name or path the Helm chart is available at in the SourceRef.
         */
        chart: string;
        /**
         * IgnoreMissingValuesFiles controls whether to silently ignore missing values files rather than failing.
         */
        ignoreMissingValuesFiles?: boolean;
        /**
         * Interval at which to check the v1.Source for updates. Defaults to
         * 'HelmReleaseSpec.Interval'.
         */
        interval?: string;
        /**
         * Determines what enables the creation of a new artifact. Valid values are
         * ('ChartVersion', 'Revision').
         * See the documentation of the values for an explanation on their behavior.
         * Defaults to ChartVersion when omitted.
         */
        reconcileStrategy?: 'ChartVersion' | 'Revision';
        /**
         * The name and namespace of the v1.Source the chart is available at.
         */
        sourceRef: {
          /**
           * APIVersion of the referent.
           */
          apiVersion?: string;
          /**
           * Kind of the referent.
           */
          kind: 'HelmRepository' | 'GitRepository' | 'Bucket';
          /**
           * Name of the referent.
           */
          name: string;
          /**
           * Namespace of the referent.
           */
          namespace?: string;
        };
        /**
         * Alternative list of values files to use as the chart values (values.yaml
         * is not included by default), expected to be a relative path in the SourceRef.
         * Values files are merged in the order of this list with the last file overriding
         * the first. Ignored when omitted.
         */
        valuesFiles?: string[];
        /**
         * Verify contains the secret name containing the trusted public keys
         * used to verify the signature and specifies which provider to use to check
         * whether OCI image is authentic.
         * This field is only supported for OCI sources.
         * Chart dependencies, which are not bundled in the umbrella chart artifact,
         * are not verified.
         */
        verify?: {
          /**
           * Provider specifies the technology used to sign the OCI Helm chart.
           */
          provider: 'cosign' | 'notation';
          /**
           * SecretRef specifies the Kubernetes Secret containing the
           * trusted public keys.
           */
          secretRef?: {
            /**
             * Name of the referent.
             */
            name: string;
          };
        };
        /**
         * Version semver expression, ignored for charts from v1.GitRepository and
         * v1beta2.Bucket sources. Defaults to latest when omitted.
         */
        version?: string;
      };
    };
    /**
     * ChartRef holds a reference to a source controller resource containing the
     * Helm chart artifact.
     */
    chartRef?: {
      /**
       * APIVersion of the referent.
       */
      apiVersion?: string;
      /**
       * Kind of the referent.
       */
      kind: 'OCIRepository' | 'HelmChart' | 'ExternalArtifact';
      /**
       * Name of the referent.
       */
      name: string;
      /**
       * Namespace of the referent, defaults to the namespace of the Kubernetes
       * resource object that contains the reference.
       */
      namespace?: string;
    };
    /**
     * CommonMetadata specifies the common labels and annotations that are
     * applied to all resources. Any existing label or annotation will be
     * overridden if its key matches a common one.
     */
    commonMetadata?: {
      /**
       * Annotations to be added to the object's metadata.
       */
      annotations?: {
        [k: string]: string;
      };
      /**
       * Labels to be added to the object's metadata.
       */
      labels?: {
        [k: string]: string;
      };
    };
    /**
     * DependsOn may contain a DependencyReference slice with
     * references to HelmRelease resources that must be ready before this HelmRelease
     * can be reconciled.
     */
    dependsOn?: {
      /**
       * Name of the referent.
       */
      name: string;
      /**
       * Namespace of the referent, defaults to the namespace of the HelmRelease
       * resource object that contains the reference.
       */
      namespace?: string;
      /**
       * ReadyExpr is a CEL expression that can be used to assess the readiness
       * of a dependency. When specified, the built-in readiness check
       * is replaced by the logic defined in the CEL expression.
       * To make the CEL expression additive to the built-in readiness check,
       * the feature gate `AdditiveCELDependencyCheck` must be set to `true`.
       */
      readyExpr?: string;
    }[];
    /**
     * DriftDetection holds the configuration for detecting and handling
     * differences between the manifest in the Helm storage and the resources
     * currently existing in the cluster.
     */
    driftDetection?: {
      /**
       * Ignore contains a list of rules for specifying which changes to ignore
       * during diffing.
       */
      ignore?: {
        /**
         * Paths is a list of JSON Pointer (RFC 6901) paths to be excluded from
         * consideration in a Kubernetes object.
         */
        paths: string[];
        /**
         * Target is a selector for specifying Kubernetes objects to which this
         * rule applies.
         * If Target is not set, the Paths will be ignored for all Kubernetes
         * objects within the manifest of the Helm release.
         */
        target?: {
          /**
           * AnnotationSelector is a string that follows the label selection expression
           * https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#api
           * It matches with the resource annotations.
           */
          annotationSelector?: string;
          /**
           * Group is the API group to select resources from.
           * Together with Version and Kind it is capable of unambiguously identifying and/or selecting resources.
           * https://github.com/kubernetes/community/blob/master/contributors/design-proposals/api-machinery/api-group.md
           */
          group?: string;
          /**
           * Kind of the API Group to select resources from.
           * Together with Group and Version it is capable of unambiguously
           * identifying and/or selecting resources.
           * https://github.com/kubernetes/community/blob/master/contributors/design-proposals/api-machinery/api-group.md
           */
          kind?: string;
          /**
           * LabelSelector is a string that follows the label selection expression
           * https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#api
           * It matches with the resource labels.
           */
          labelSelector?: string;
          /**
           * Name to match resources with.
           */
          name?: string;
          /**
           * Namespace to select resources from.
           */
          namespace?: string;
          /**
           * Version of the API Group to select resources from.
           * Together with Group and Kind it is capable of unambiguously identifying and/or selecting resources.
           * https://github.com/kubernetes/community/blob/master/contributors/design-proposals/api-machinery/api-group.md
           */
          version?: string;
        };
      }[];
      /**
       * Mode defines how differences should be handled between the Helm manifest
       * and the manifest currently applied to the cluster.
       * If not explicitly set, it defaults to DiffModeDisabled.
       */
      mode?: 'enabled' | 'warn' | 'disabled';
    };
    /**
     * Install holds the configuration for Helm install actions for this HelmRelease.
     */
    install?: {
      /**
       * CRDs upgrade CRDs from the Helm Chart's crds directory according
       * to the CRD upgrade policy provided here. Valid values are `Skip`,
       * `Create` or `CreateReplace`. Default is `Create` and if omitted
       * CRDs are installed but not updated.
       *
       * Skip: do neither install nor replace (update) any CRDs.
       *
       * Create: new CRDs are created, existing CRDs are neither updated nor deleted.
       *
       * CreateReplace: new CRDs are created, existing CRDs are updated (replaced)
       * but not deleted.
       *
       * By default, CRDs are applied (installed) during Helm install action.
       * With this option users can opt in to CRD replace existing CRDs on Helm
       * install actions, which is not (yet) natively supported by Helm.
       * https://helm.sh/docs/chart_best_practices/custom_resource_definitions.
       */
      crds?: 'Skip' | 'Create' | 'CreateReplace';
      /**
       * CreateNamespace tells the Helm install action to create the
       * HelmReleaseSpec.TargetNamespace if it does not exist yet.
       * On uninstall, the namespace will not be garbage collected.
       */
      createNamespace?: boolean;
      /**
       * DisableHooks prevents hooks from running during the Helm install action.
       */
      disableHooks?: boolean;
      /**
       * DisableOpenAPIValidation prevents the Helm install action from validating
       * rendered templates against the Kubernetes OpenAPI Schema.
       */
      disableOpenAPIValidation?: boolean;
      /**
       * DisableSchemaValidation prevents the Helm install action from validating
       * the values against the JSON Schema.
       */
      disableSchemaValidation?: boolean;
      /**
       * DisableTakeOwnership disables taking ownership of existing resources
       * during the Helm install action. Defaults to false.
       */
      disableTakeOwnership?: boolean;
      /**
       * DisableWait disables the waiting for resources to be ready after a Helm
       * install has been performed.
       */
      disableWait?: boolean;
      /**
       * DisableWaitForJobs disables waiting for jobs to complete after a Helm
       * install has been performed.
       */
      disableWaitForJobs?: boolean;
      /**
       * Remediation holds the remediation configuration for when the Helm install
       * action for the HelmRelease fails. The default is to not perform any action.
       */
      remediation?: {
        /**
         * IgnoreTestFailures tells the controller to skip remediation when the Helm
         * tests are run after an install action but fail. Defaults to
         * 'Test.IgnoreFailures'.
         */
        ignoreTestFailures?: boolean;
        /**
         * RemediateLastFailure tells the controller to remediate the last failure, when
         * no retries remain. Defaults to 'false'.
         */
        remediateLastFailure?: boolean;
        /**
         * Retries is the number of retries that should be attempted on failures before
         * bailing. Remediation, using an uninstall, is performed between each attempt.
         * Defaults to '0', a negative integer equals to unlimited retries.
         */
        retries?: number;
      };
      /**
       * Replace tells the Helm install action to re-use the 'ReleaseName', but only
       * if that name is a deleted release which remains in the history.
       */
      replace?: boolean;
      /**
       * SkipCRDs tells the Helm install action to not install any CRDs. By default,
       * CRDs are installed if not already present.
       *
       * Deprecated use CRD policy (`crds`) attribute with value `Skip` instead.
       */
      skipCRDs?: boolean;
      /**
       * Strategy defines the install strategy to use for this HelmRelease.
       * Defaults to 'RemediateOnFailure'.
       */
      strategy?: {
        /**
         * Name of the install strategy.
         */
        name: 'RemediateOnFailure' | 'RetryOnFailure';
        /**
         * RetryInterval is the interval at which to retry a failed install.
         * Can be used only when Name is set to RetryOnFailure.
         * Defaults to '5m'.
         */
        retryInterval?: string;
      };
      /**
       * Timeout is the time to wait for any individual Kubernetes operation (like
       * Jobs for hooks) during the performance of a Helm install action. Defaults to
       * 'HelmReleaseSpec.Timeout'.
       */
      timeout?: string;
    };
    /**
     * Interval at which to reconcile the Helm release.
     */
    interval: string;
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
       * ConfigMapRef holds an optional name of a ConfigMap that contains
       * the following keys:
       *
       * - `provider`: the provider to use. One of `aws`, `azure`, `gcp`, or
       *    `generic`. Required.
       * - `cluster`: the fully qualified resource name of the Kubernetes
       *    cluster in the cloud provider API. Not used by the `generic`
       *    provider. Required when one of `address` or `ca.crt` is not set.
       * - `address`: the address of the Kubernetes API server. Required
       *    for `generic`. For the other providers, if not specified, the
       *    first address in the cluster resource will be used, and if
       *    specified, it must match one of the addresses in the cluster
       *    resource.
       *    If audiences is not set, will be used as the audience for the
       *    `generic` provider.
       * - `ca.crt`: the optional PEM-encoded CA certificate for the
       *    Kubernetes API server. If not set, the controller will use the
       *    CA certificate from the cluster resource.
       * - `audiences`: the optional audiences as a list of
       *    line-break-separated strings for the Kubernetes ServiceAccount
       *    token. Defaults to the `address` for the `generic` provider, or
       *    to specific values for the other providers depending on the
       *    provider.
       * -  `serviceAccountName`: the optional name of the Kubernetes
       *    ServiceAccount in the same namespace that should be used
       *    for authentication. If not specified, the controller
       *    ServiceAccount will be used.
       *
       * Mutually exclusive with SecretRef.
       */
      configMapRef?: {
        /**
         * Name of the referent.
         */
        name: string;
      };
      /**
       * SecretRef holds an optional name of a secret that contains a key with
       * the kubeconfig file as the value. If no key is set, the key will default
       * to 'value'. Mutually exclusive with ConfigMapRef.
       * It is recommended that the kubeconfig is self-contained, and the secret
       * is regularly updated if credentials such as a cloud-access-token expire.
       * Cloud specific `cmd-path` auth helpers will not function without adding
       * binaries and credentials to the Pod that is responsible for reconciling
       * Kubernetes resources. Supported only for the generic provider.
       */
      secretRef?: {
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
     * MaxHistory is the number of revisions saved by Helm for this HelmRelease.
     * Use '0' for an unlimited number of revisions; defaults to '5'.
     */
    maxHistory?: number;
    /**
     * PersistentClient tells the controller to use a persistent Kubernetes
     * client for this release. When enabled, the client will be reused for the
     * duration of the reconciliation, instead of being created and destroyed
     * for each (step of a) Helm action.
     *
     * This can improve performance, but may cause issues with some Helm charts
     * that for example do create Custom Resource Definitions during installation
     * outside Helm's CRD lifecycle hooks, which are then not observed to be
     * available by e.g. post-install hooks.
     *
     * If not set, it defaults to true.
     */
    persistentClient?: boolean;
    /**
     * PostRenderers holds an array of Helm PostRenderers, which will be applied in order
     * of their definition.
     */
    postRenderers?: {
      /**
       * Kustomization to apply as PostRenderer.
       */
      kustomize?: {
        /**
         * Images is a list of (image name, new name, new tag or digest)
         * for changing image names, tags or digests. This can also be achieved with a
         * patch, but this operator is simpler to specify.
         */
        images?: {
          /**
           * Digest is the value used to replace the original image tag.
           * If digest is present NewTag value is ignored.
           */
          digest?: string;
          /**
           * Name is a tag-less image name.
           */
          name: string;
          /**
           * NewName is the value used to replace the original name.
           */
          newName?: string;
          /**
           * NewTag is the value used to replace the original tag.
           */
          newTag?: string;
        }[];
        /**
         * Strategic merge and JSON patches, defined as inline YAML objects,
         * capable of targeting objects based on kind, label and annotation selectors.
         */
        patches?: {
          /**
           * Patch contains an inline StrategicMerge patch or an inline JSON6902 patch with
           * an array of operation objects.
           */
          patch: string;
          /**
           * Target points to the resources that the patch document should be applied to.
           */
          target?: {
            /**
             * AnnotationSelector is a string that follows the label selection expression
             * https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#api
             * It matches with the resource annotations.
             */
            annotationSelector?: string;
            /**
             * Group is the API group to select resources from.
             * Together with Version and Kind it is capable of unambiguously identifying and/or selecting resources.
             * https://github.com/kubernetes/community/blob/master/contributors/design-proposals/api-machinery/api-group.md
             */
            group?: string;
            /**
             * Kind of the API Group to select resources from.
             * Together with Group and Version it is capable of unambiguously
             * identifying and/or selecting resources.
             * https://github.com/kubernetes/community/blob/master/contributors/design-proposals/api-machinery/api-group.md
             */
            kind?: string;
            /**
             * LabelSelector is a string that follows the label selection expression
             * https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#api
             * It matches with the resource labels.
             */
            labelSelector?: string;
            /**
             * Name to match resources with.
             */
            name?: string;
            /**
             * Namespace to select resources from.
             */
            namespace?: string;
            /**
             * Version of the API Group to select resources from.
             * Together with Group and Kind it is capable of unambiguously identifying and/or selecting resources.
             * https://github.com/kubernetes/community/blob/master/contributors/design-proposals/api-machinery/api-group.md
             */
            version?: string;
          };
        }[];
      };
    }[];
    /**
     * ReleaseName used for the Helm release. Defaults to a composition of
     * '[TargetNamespace-]Name'.
     */
    releaseName?: string;
    /**
     * Rollback holds the configuration for Helm rollback actions for this HelmRelease.
     */
    rollback?: {
      /**
       * CleanupOnFail allows deletion of new resources created during the Helm
       * rollback action when it fails.
       */
      cleanupOnFail?: boolean;
      /**
       * DisableHooks prevents hooks from running during the Helm rollback action.
       */
      disableHooks?: boolean;
      /**
       * DisableWait disables the waiting for resources to be ready after a Helm
       * rollback has been performed.
       */
      disableWait?: boolean;
      /**
       * DisableWaitForJobs disables waiting for jobs to complete after a Helm
       * rollback has been performed.
       */
      disableWaitForJobs?: boolean;
      /**
       * Force forces resource updates through a replacement strategy.
       */
      force?: boolean;
      /**
       * Recreate performs pod restarts for the resource if applicable.
       */
      recreate?: boolean;
      /**
       * Timeout is the time to wait for any individual Kubernetes operation (like
       * Jobs for hooks) during the performance of a Helm rollback action. Defaults to
       * 'HelmReleaseSpec.Timeout'.
       */
      timeout?: string;
    };
    /**
     * The name of the Kubernetes service account to impersonate
     * when reconciling this HelmRelease.
     */
    serviceAccountName?: string;
    /**
     * StorageNamespace used for the Helm storage.
     * Defaults to the namespace of the HelmRelease.
     */
    storageNamespace?: string;
    /**
     * Suspend tells the controller to suspend reconciliation for this HelmRelease,
     * it does not apply to already started reconciliations. Defaults to false.
     */
    suspend?: boolean;
    /**
     * TargetNamespace to target when performing operations for the HelmRelease.
     * Defaults to the namespace of the HelmRelease.
     */
    targetNamespace?: string;
    /**
     * Test holds the configuration for Helm test actions for this HelmRelease.
     */
    test?: {
      /**
       * Enable enables Helm test actions for this HelmRelease after an Helm install
       * or upgrade action has been performed.
       */
      enable?: boolean;
      /**
       * Filters is a list of tests to run or exclude from running.
       */
      filters?: {
        /**
         * Exclude specifies whether the named test should be excluded.
         */
        exclude?: boolean;
        /**
         * Name is the name of the test.
         */
        name: string;
      }[];
      /**
       * IgnoreFailures tells the controller to skip remediation when the Helm tests
       * are run but fail. Can be overwritten for tests run after install or upgrade
       * actions in 'Install.IgnoreTestFailures' and 'Upgrade.IgnoreTestFailures'.
       */
      ignoreFailures?: boolean;
      /**
       * Timeout is the time to wait for any individual Kubernetes operation during
       * the performance of a Helm test action. Defaults to 'HelmReleaseSpec.Timeout'.
       */
      timeout?: string;
    };
    /**
     * Timeout is the time to wait for any individual Kubernetes operation (like Jobs
     * for hooks) during the performance of a Helm action. Defaults to '5m0s'.
     */
    timeout?: string;
    /**
     * Uninstall holds the configuration for Helm uninstall actions for this HelmRelease.
     */
    uninstall?: {
      /**
       * DeletionPropagation specifies the deletion propagation policy when
       * a Helm uninstall is performed.
       */
      deletionPropagation?: 'background' | 'foreground' | 'orphan';
      /**
       * DisableHooks prevents hooks from running during the Helm rollback action.
       */
      disableHooks?: boolean;
      /**
       * DisableWait disables waiting for all the resources to be deleted after
       * a Helm uninstall is performed.
       */
      disableWait?: boolean;
      /**
       * KeepHistory tells Helm to remove all associated resources and mark the
       * release as deleted, but retain the release history.
       */
      keepHistory?: boolean;
      /**
       * Timeout is the time to wait for any individual Kubernetes operation (like
       * Jobs for hooks) during the performance of a Helm uninstall action. Defaults
       * to 'HelmReleaseSpec.Timeout'.
       */
      timeout?: string;
    };
    /**
     * Upgrade holds the configuration for Helm upgrade actions for this HelmRelease.
     */
    upgrade?: {
      /**
       * CleanupOnFail allows deletion of new resources created during the Helm
       * upgrade action when it fails.
       */
      cleanupOnFail?: boolean;
      /**
       * CRDs upgrade CRDs from the Helm Chart's crds directory according
       * to the CRD upgrade policy provided here. Valid values are `Skip`,
       * `Create` or `CreateReplace`. Default is `Skip` and if omitted
       * CRDs are neither installed nor upgraded.
       *
       * Skip: do neither install nor replace (update) any CRDs.
       *
       * Create: new CRDs are created, existing CRDs are neither updated nor deleted.
       *
       * CreateReplace: new CRDs are created, existing CRDs are updated (replaced)
       * but not deleted.
       *
       * By default, CRDs are not applied during Helm upgrade action. With this
       * option users can opt-in to CRD upgrade, which is not (yet) natively supported by Helm.
       * https://helm.sh/docs/chart_best_practices/custom_resource_definitions.
       */
      crds?: 'Skip' | 'Create' | 'CreateReplace';
      /**
       * DisableHooks prevents hooks from running during the Helm upgrade action.
       */
      disableHooks?: boolean;
      /**
       * DisableOpenAPIValidation prevents the Helm upgrade action from validating
       * rendered templates against the Kubernetes OpenAPI Schema.
       */
      disableOpenAPIValidation?: boolean;
      /**
       * DisableSchemaValidation prevents the Helm upgrade action from validating
       * the values against the JSON Schema.
       */
      disableSchemaValidation?: boolean;
      /**
       * DisableTakeOwnership disables taking ownership of existing resources
       * during the Helm upgrade action. Defaults to false.
       */
      disableTakeOwnership?: boolean;
      /**
       * DisableWait disables the waiting for resources to be ready after a Helm
       * upgrade has been performed.
       */
      disableWait?: boolean;
      /**
       * DisableWaitForJobs disables waiting for jobs to complete after a Helm
       * upgrade has been performed.
       */
      disableWaitForJobs?: boolean;
      /**
       * Force forces resource updates through a replacement strategy.
       */
      force?: boolean;
      /**
       * PreserveValues will make Helm reuse the last release's values and merge in
       * overrides from 'Values'. Setting this flag makes the HelmRelease
       * non-declarative.
       */
      preserveValues?: boolean;
      /**
       * Remediation holds the remediation configuration for when the Helm upgrade
       * action for the HelmRelease fails. The default is to not perform any action.
       */
      remediation?: {
        /**
         * IgnoreTestFailures tells the controller to skip remediation when the Helm
         * tests are run after an upgrade action but fail.
         * Defaults to 'Test.IgnoreFailures'.
         */
        ignoreTestFailures?: boolean;
        /**
         * RemediateLastFailure tells the controller to remediate the last failure, when
         * no retries remain. Defaults to 'false' unless 'Retries' is greater than 0.
         */
        remediateLastFailure?: boolean;
        /**
         * Retries is the number of retries that should be attempted on failures before
         * bailing. Remediation, using 'Strategy', is performed between each attempt.
         * Defaults to '0', a negative integer equals to unlimited retries.
         */
        retries?: number;
        /**
         * Strategy to use for failure remediation. Defaults to 'rollback'.
         */
        strategy?: 'rollback' | 'uninstall';
      };
      /**
       * Strategy defines the upgrade strategy to use for this HelmRelease.
       * Defaults to 'RemediateOnFailure'.
       */
      strategy?: {
        /**
         * Name of the upgrade strategy.
         */
        name: 'RemediateOnFailure' | 'RetryOnFailure';
        /**
         * RetryInterval is the interval at which to retry a failed upgrade.
         * Can be used only when Name is set to RetryOnFailure.
         * Defaults to '5m'.
         */
        retryInterval?: string;
      };
      /**
       * Timeout is the time to wait for any individual Kubernetes operation (like
       * Jobs for hooks) during the performance of a Helm upgrade action. Defaults to
       * 'HelmReleaseSpec.Timeout'.
       */
      timeout?: string;
    };
    /**
     * Values holds the values for this Helm release.
     */
    values?: {
      [k: string]: unknown;
    };
    /**
     * ValuesFrom holds references to resources containing Helm values for this HelmRelease,
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
  };
  /**
   * HelmReleaseStatus defines the observed state of a HelmRelease.
   */
  status?: {
    /**
     * Conditions holds the conditions for the HelmRelease.
     */
    conditions?: {
      /**
       * lastTransitionTime is the last time the condition transitioned from one status to another.
       * This should be when the underlying condition changed.  If that is not known, then using the time when the API field changed is acceptable.
       */
      lastTransitionTime: string;
      /**
       * message is a human readable message indicating details about the transition.
       * This may be an empty string.
       */
      message: string;
      /**
       * observedGeneration represents the .metadata.generation that the condition was set based upon.
       * For instance, if .metadata.generation is currently 12, but the .status.conditions[x].observedGeneration is 9, the condition is out of date
       * with respect to the current state of the instance.
       */
      observedGeneration?: number;
      /**
       * reason contains a programmatic identifier indicating the reason for the condition's last transition.
       * Producers of specific condition types may define expected values and meanings for this field,
       * and whether the values are considered a guaranteed API.
       * The value should be a CamelCase string.
       * This field may not be empty.
       */
      reason: string;
      /**
       * status of the condition, one of True, False, Unknown.
       */
      status: 'True' | 'False' | 'Unknown';
      /**
       * type of condition in CamelCase or in foo.example.com/CamelCase.
       */
      type: string;
    }[];
    /**
     * Failures is the reconciliation failure count against the latest desired
     * state. It is reset after a successful reconciliation.
     */
    failures?: number;
    /**
     * HelmChart is the namespaced name of the HelmChart resource created by
     * the controller for the HelmRelease.
     */
    helmChart?: string;
    /**
     * History holds the history of Helm releases performed for this HelmRelease
     * up to the last successfully completed release.
     */
    history?: {
      /**
       * APIVersion is the API version of the Snapshot.
       * Provisional: when the calculation method of the Digest field is changed,
       * this field will be used to distinguish between the old and new methods.
       */
      apiVersion?: string;
      /**
       * AppVersion is the chart app version of the release object in storage.
       */
      appVersion?: string;
      /**
       * ChartName is the chart name of the release object in storage.
       */
      chartName: string;
      /**
       * ChartVersion is the chart version of the release object in
       * storage.
       */
      chartVersion: string;
      /**
       * ConfigDigest is the checksum of the config (better known as
       * "values") of the release object in storage.
       * It has the format of `<algo>:<checksum>`.
       */
      configDigest: string;
      /**
       * Deleted is when the release was deleted.
       */
      deleted?: string;
      /**
       * Digest is the checksum of the release object in storage.
       * It has the format of `<algo>:<checksum>`.
       */
      digest: string;
      /**
       * FirstDeployed is when the release was first deployed.
       */
      firstDeployed: string;
      /**
       * LastDeployed is when the release was last deployed.
       */
      lastDeployed: string;
      /**
       * Name is the name of the release.
       */
      name: string;
      /**
       * Namespace is the namespace the release is deployed to.
       */
      namespace: string;
      /**
       * OCIDigest is the digest of the OCI artifact associated with the release.
       */
      ociDigest?: string;
      /**
       * Status is the current state of the release.
       */
      status: string;
      /**
       * TestHooks is the list of test hooks for the release as observed to be
       * run by the controller.
       */
      testHooks?: {
        /**
         * TestHookStatus holds the status information for a test hook as observed
         * to be run by the controller.
         */
        [k: string]: {
          /**
           * LastCompleted is the time the test hook last completed.
           */
          lastCompleted?: string;
          /**
           * LastStarted is the time the test hook was last started.
           */
          lastStarted?: string;
          /**
           * Phase the test hook was observed to be in.
           */
          phase?: string;
        };
      };
      /**
       * Version is the version of the release object in storage.
       */
      version: number;
    }[];
    /**
     * InstallFailures is the install failure count against the latest desired
     * state. It is reset after a successful reconciliation.
     */
    installFailures?: number;
    /**
     * LastAttemptedConfigDigest is the digest for the config (better known as
     * "values") of the last reconciliation attempt.
     */
    lastAttemptedConfigDigest?: string;
    /**
     * LastAttemptedGeneration is the last generation the controller attempted
     * to reconcile.
     */
    lastAttemptedGeneration?: number;
    /**
     * LastAttemptedReleaseAction is the last release action performed for this
     * HelmRelease. It is used to determine the active retry or remediation
     * strategy.
     */
    lastAttemptedReleaseAction?: 'install' | 'upgrade';
    /**
     * LastAttemptedReleaseActionDuration is the duration of the last
     * release action performed for this HelmRelease.
     */
    lastAttemptedReleaseActionDuration?: string;
    /**
     * LastAttemptedRevision is the Source revision of the last reconciliation
     * attempt. For OCIRepository  sources, the 12 first characters of the digest are
     * appended to the chart version e.g. "1.2.3+1234567890ab".
     */
    lastAttemptedRevision?: string;
    /**
     * LastAttemptedRevisionDigest is the digest of the last reconciliation attempt.
     * This is only set for OCIRepository sources.
     */
    lastAttemptedRevisionDigest?: string;
    /**
     * LastAttemptedValuesChecksum is the SHA1 checksum for the values of the last
     * reconciliation attempt.
     *
     * Deprecated: Use LastAttemptedConfigDigest instead.
     */
    lastAttemptedValuesChecksum?: string;
    /**
     * LastHandledForceAt holds the value of the most recent
     * force request value, so a change of the annotation value
     * can be detected.
     */
    lastHandledForceAt?: string;
    /**
     * LastHandledReconcileAt holds the value of the most recent
     * reconcile request value, so a change of the annotation value
     * can be detected.
     */
    lastHandledReconcileAt?: string;
    /**
     * LastHandledResetAt holds the value of the most recent reset request
     * value, so a change of the annotation value can be detected.
     */
    lastHandledResetAt?: string;
    /**
     * LastReleaseRevision is the revision of the last successful Helm release.
     *
     * Deprecated: Use History instead.
     */
    lastReleaseRevision?: number;
    /**
     * ObservedCommonMetadataDigest is the digest for the common metadata of
     * the last successful reconciliation attempt.
     */
    observedCommonMetadataDigest?: string;
    /**
     * ObservedGeneration is the last observed generation.
     */
    observedGeneration?: number;
    /**
     * ObservedPostRenderersDigest is the digest for the post-renderers of
     * the last successful reconciliation attempt.
     */
    observedPostRenderersDigest?: string;
    /**
     * StorageNamespace is the namespace of the Helm release storage for the
     * current release.
     */
    storageNamespace?: string;
    /**
     * UpgradeFailures is the upgrade failure count against the latest desired
     * state. It is reset after a successful reconciliation.
     */
    upgradeFailures?: number;
  };
}

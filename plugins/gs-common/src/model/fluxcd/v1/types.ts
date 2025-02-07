/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * Kustomization is the Schema for the kustomizations API.
 */
export interface IKustomization {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'Kustomization';
  metadata: metav1.IObjectMeta;
  /**
   * KustomizationSpec defines the configuration to calculate the desired state
   * from a Source using Kustomize.
   */
  spec?: {
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
     * Components specifies relative paths to specifications of other Components.
     */
    components?: string[];
    /**
     * Decrypt Kubernetes secrets before applying them on the cluster.
     */
    decryption?: {
      /**
       * Provider is the name of the decryption engine.
       */
      provider: 'sops';
      /**
       * The secret name containing the private OpenPGP keys used for decryption.
       */
      secretRef?: {
        /**
         * Name of the referent.
         */
        name: string;
      };
    };
    /**
     * DeletionPolicy can be used to control garbage collection when this
     * Kustomization is deleted. Valid values are ('MirrorPrune', 'Delete',
     * 'Orphan'). 'MirrorPrune' mirrors the Prune field (orphan if false,
     * delete if true). Defaults to 'MirrorPrune'.
     */
    deletionPolicy?: 'MirrorPrune' | 'Delete' | 'Orphan';
    /**
     * DependsOn may contain a meta.NamespacedObjectReference slice
     * with references to Kustomization resources that must be ready before this
     * Kustomization can be reconciled.
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
     * Force instructs the controller to recreate resources
     * when patching fails due to an immutable field change.
     */
    force?: boolean;
    /**
     * HealthCheckExprs is a list of healthcheck expressions for evaluating the
     * health of custom resources using Common Expression Language (CEL).
     * The expressions are evaluated only when Wait or HealthChecks are specified.
     */
    healthCheckExprs?: {
      /**
       * APIVersion of the custom resource under evaluation.
       */
      apiVersion: string;
      /**
       * Current is the CEL expression that determines if the status
       * of the custom resource has reached the desired state.
       */
      current: string;
      /**
       * Failed is the CEL expression that determines if the status
       * of the custom resource has failed to reach the desired state.
       */
      failed?: string;
      /**
       * InProgress is the CEL expression that determines if the status
       * of the custom resource has not yet reached the desired state.
       */
      inProgress?: string;
      /**
       * Kind of the custom resource under evaluation.
       */
      kind: string;
    }[];
    /**
     * A list of resources to be included in the health assessment.
     */
    healthChecks?: {
      /**
       * API version of the referent, if not specified the Kubernetes preferred version will be used.
       */
      apiVersion?: string;
      /**
       * Kind of the referent.
       */
      kind: string;
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
     * The interval at which to reconcile the Kustomization.
     * This interval is approximate and may be subject to jitter to ensure
     * efficient use of resources.
     */
    interval: string;
    /**
     * The KubeConfig for reconciling the Kustomization on a remote cluster.
     * When used in combination with KustomizationSpec.ServiceAccountName,
     * forces the controller to act on behalf of that Service Account at the
     * target cluster.
     * If the --default-service-account flag is set, its value will be used as
     * a controller level fallback for when KustomizationSpec.ServiceAccountName
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
     * NamePrefix will prefix the names of all managed resources.
     */
    namePrefix?: string;
    /**
     * NameSuffix will suffix the names of all managed resources.
     */
    nameSuffix?: string;
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
    /**
     * Path to the directory containing the kustomization.yaml file, or the
     * set of plain YAMLs a kustomization.yaml should be generated for.
     * Defaults to 'None', which translates to the root path of the SourceRef.
     */
    path?: string;
    /**
     * PostBuild describes which actions to perform on the YAML manifest
     * generated by building the kustomize overlay.
     */
    postBuild?: {
      /**
       * Substitute holds a map of key/value pairs.
       * The variables defined in your YAML manifests that match any of the keys
       * defined in the map will be substituted with the set value.
       * Includes support for bash string replacement functions
       * e.g. ${var:=default}, ${var:position} and ${var/substring/replacement}.
       */
      substitute?: {
        [k: string]: string;
      };
      /**
       * SubstituteFrom holds references to ConfigMaps and Secrets containing
       * the variables and their values to be substituted in the YAML manifests.
       * The ConfigMap and the Secret data keys represent the var names, and they
       * must match the vars declared in the manifests for the substitution to
       * happen.
       */
      substituteFrom?: {
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
         * Optional indicates whether the referenced resource must exist, or whether to
         * tolerate its absence. If true and the referenced resource is absent, proceed
         * as if the resource was present but empty, without any variables defined.
         */
        optional?: boolean;
      }[];
    };
    /**
     * Prune enables garbage collection.
     */
    prune: boolean;
    /**
     * The interval at which to retry a previously failed reconciliation.
     * When not specified, the controller uses the KustomizationSpec.Interval
     * value to retry failures.
     */
    retryInterval?: string;
    /**
     * The name of the Kubernetes service account to impersonate
     * when reconciling this Kustomization.
     */
    serviceAccountName?: string;
    /**
     * Reference of the source where the kustomization file is.
     */
    sourceRef: {
      /**
       * API version of the referent.
       */
      apiVersion?: string;
      /**
       * Kind of the referent.
       */
      kind: 'OCIRepository' | 'GitRepository' | 'Bucket';
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
     * This flag tells the controller to suspend subsequent kustomize executions,
     * it does not apply to already started executions. Defaults to false.
     */
    suspend?: boolean;
    /**
     * TargetNamespace sets or overrides the namespace in the
     * kustomization.yaml file.
     */
    targetNamespace?: string;
    /**
     * Timeout for validation, apply and health checking operations.
     * Defaults to 'Interval' duration.
     */
    timeout?: string;
    /**
     * Wait instructs the controller to check the health of all the reconciled
     * resources. When enabled, the HealthChecks are ignored. Defaults to false.
     */
    wait?: boolean;
  };
  /**
   * KustomizationStatus defines the observed state of a kustomization.
   */
  status?: {
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
     * Inventory contains the list of Kubernetes resource object references that
     * have been successfully applied.
     */
    inventory?: {
      /**
       * Entries of Kubernetes resource object references.
       */
      entries: {
        /**
         * ID is the string representation of the Kubernetes resource object's metadata,
         * in the format '<namespace>_<name>_<group>_<kind>'.
         */
        id: string;
        /**
         * Version is the API version of the Kubernetes resource object's kind.
         */
        v: string;
      }[];
    };
    /**
     * The last successfully applied origin revision.
     * Equals the origin revision of the applied Artifact from the referenced Source.
     * Usually present on the Metadata of the applied Artifact and depends on the
     * Source type, e.g. for OCI it's the value associated with the key
     * "org.opencontainers.image.revision".
     */
    lastAppliedOriginRevision?: string;
    /**
     * The last successfully applied revision.
     * Equals the Revision of the applied Artifact from the referenced Source.
     */
    lastAppliedRevision?: string;
    /**
     * LastAttemptedRevision is the revision of the last reconciliation attempt.
     */
    lastAttemptedRevision?: string;
    /**
     * LastHandledReconcileAt holds the value of the most recent
     * reconcile request value, so a change of the annotation value
     * can be detected.
     */
    lastHandledReconcileAt?: string;
    /**
     * ObservedGeneration is the last reconciled generation.
     */
    observedGeneration?: number;
  };
}

/**
 * GitRepository is the Schema for the gitrepositories API.
 */
export interface IGitRepository {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'GitRepository';
  metadata: metav1.IObjectMeta;
  /**
   * GitRepositorySpec specifies the required configuration to produce an
   * Artifact for a Git repository.
   */
  spec?: {
    /**
     * Ignore overrides the set of excluded patterns in the .sourceignore format
     * (which is the same as .gitignore). If not provided, a default will be used,
     * consult the documentation for your version to find out what those are.
     */
    ignore?: string;
    /**
     * Include specifies a list of GitRepository resources which Artifacts
     * should be included in the Artifact produced for this GitRepository.
     */
    include?: {
      /**
       * FromPath specifies the path to copy contents from, defaults to the root
       * of the Artifact.
       */
      fromPath?: string;
      /**
       * GitRepositoryRef specifies the GitRepository which Artifact contents
       * must be included.
       */
      repository: {
        /**
         * Name of the referent.
         */
        name: string;
      };
      /**
       * ToPath specifies the path to copy contents to, defaults to the name of
       * the GitRepositoryRef.
       */
      toPath?: string;
    }[];
    /**
     * Interval at which the GitRepository URL is checked for updates.
     * This interval is approximate and may be subject to jitter to ensure
     * efficient use of resources.
     */
    interval: string;
    /**
     * Provider used for authentication, can be 'azure', 'github', 'generic'.
     * When not specified, defaults to 'generic'.
     */
    provider?: 'generic' | 'azure' | 'github';
    /**
     * ProxySecretRef specifies the Secret containing the proxy configuration
     * to use while communicating with the Git server.
     */
    proxySecretRef?: {
      /**
       * Name of the referent.
       */
      name: string;
    };
    /**
     * RecurseSubmodules enables the initialization of all submodules within
     * the GitRepository as cloned from the URL, using their default settings.
     */
    recurseSubmodules?: boolean;
    /**
     * Reference specifies the Git reference to resolve and monitor for
     * changes, defaults to the 'master' branch.
     */
    ref?: {
      /**
       * Branch to check out, defaults to 'master' if no other field is defined.
       */
      branch?: string;
      /**
       * Commit SHA to check out, takes precedence over all reference fields.
       *
       * This can be combined with Branch to shallow clone the branch, in which
       * the commit is expected to exist.
       */
      commit?: string;
      /**
       * Name of the reference to check out; takes precedence over Branch, Tag and SemVer.
       *
       * It must be a valid Git reference: https://git-scm.com/docs/git-check-ref-format#_description
       * Examples: "refs/heads/main", "refs/tags/v0.1.0", "refs/pull/420/head", "refs/merge-requests/1/head"
       */
      name?: string;
      /**
       * SemVer tag expression to check out, takes precedence over Tag.
       */
      semver?: string;
      /**
       * Tag to check out, takes precedence over Branch.
       */
      tag?: string;
    };
    /**
     * SecretRef specifies the Secret containing authentication credentials for
     * the GitRepository.
     * For HTTPS repositories the Secret must contain 'username' and 'password'
     * fields for basic auth or 'bearerToken' field for token auth.
     * For SSH repositories the Secret must contain 'identity'
     * and 'known_hosts' fields.
     */
    secretRef?: {
      /**
       * Name of the referent.
       */
      name: string;
    };
    /**
     * Suspend tells the controller to suspend the reconciliation of this
     * GitRepository.
     */
    suspend?: boolean;
    /**
     * Timeout for Git operations like cloning, defaults to 60s.
     */
    timeout?: string;
    /**
     * URL specifies the Git repository URL, it can be an HTTP/S or SSH address.
     */
    url: string;
    /**
     * Verification specifies the configuration to verify the Git commit
     * signature(s).
     */
    verify?: {
      /**
       * Mode specifies which Git object(s) should be verified.
       *
       * The variants "head" and "HEAD" both imply the same thing, i.e. verify
       * the commit that the HEAD of the Git repository points to. The variant
       * "head" solely exists to ensure backwards compatibility.
       */
      mode?: 'head' | 'HEAD' | 'Tag' | 'TagAndHEAD';
      /**
       * SecretRef specifies the Secret containing the public keys of trusted Git
       * authors.
       */
      secretRef: {
        /**
         * Name of the referent.
         */
        name: string;
      };
    };
  };
  /**
   * GitRepositoryStatus records the observed state of a Git repository.
   */
  status?: {
    /**
     * Artifact represents the last successful GitRepository reconciliation.
     */
    artifact?: {
      /**
       * Digest is the digest of the file in the form of '<algorithm>:<checksum>'.
       */
      digest?: string;
      /**
       * LastUpdateTime is the timestamp corresponding to the last update of the
       * Artifact.
       */
      lastUpdateTime: string;
      /**
       * Metadata holds upstream information such as OCI annotations.
       */
      metadata?: {
        [k: string]: string;
      };
      /**
       * Path is the relative file path of the Artifact. It can be used to locate
       * the file in the root of the Artifact storage on the local file system of
       * the controller managing the Source.
       */
      path: string;
      /**
       * Revision is a human-readable identifier traceable in the origin source
       * system. It can be a Git commit SHA, Git tag, a Helm chart version, etc.
       */
      revision: string;
      /**
       * Size is the number of bytes in the file.
       */
      size?: number;
      /**
       * URL is the HTTP address of the Artifact as exposed by the controller
       * managing the Source. It can be used to retrieve the Artifact for
       * consumption, e.g. by another controller applying the Artifact contents.
       */
      url: string;
    };
    /**
     * Conditions holds the conditions for the GitRepository.
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
     * IncludedArtifacts contains a list of the last successfully included
     * Artifacts as instructed by GitRepositorySpec.Include.
     */
    includedArtifacts?: {
      /**
       * Digest is the digest of the file in the form of '<algorithm>:<checksum>'.
       */
      digest?: string;
      /**
       * LastUpdateTime is the timestamp corresponding to the last update of the
       * Artifact.
       */
      lastUpdateTime: string;
      /**
       * Metadata holds upstream information such as OCI annotations.
       */
      metadata?: {
        [k: string]: string;
      };
      /**
       * Path is the relative file path of the Artifact. It can be used to locate
       * the file in the root of the Artifact storage on the local file system of
       * the controller managing the Source.
       */
      path: string;
      /**
       * Revision is a human-readable identifier traceable in the origin source
       * system. It can be a Git commit SHA, Git tag, a Helm chart version, etc.
       */
      revision: string;
      /**
       * Size is the number of bytes in the file.
       */
      size?: number;
      /**
       * URL is the HTTP address of the Artifact as exposed by the controller
       * managing the Source. It can be used to retrieve the Artifact for
       * consumption, e.g. by another controller applying the Artifact contents.
       */
      url: string;
    }[];
    /**
     * LastHandledReconcileAt holds the value of the most recent
     * reconcile request value, so a change of the annotation value
     * can be detected.
     */
    lastHandledReconcileAt?: string;
    /**
     * ObservedGeneration is the last observed generation of the GitRepository
     * object.
     */
    observedGeneration?: number;
    /**
     * ObservedIgnore is the observed exclusion patterns used for constructing
     * the source artifact.
     */
    observedIgnore?: string;
    /**
     * ObservedInclude is the observed list of GitRepository resources used to
     * produce the current Artifact.
     */
    observedInclude?: {
      /**
       * FromPath specifies the path to copy contents from, defaults to the root
       * of the Artifact.
       */
      fromPath?: string;
      /**
       * GitRepositoryRef specifies the GitRepository which Artifact contents
       * must be included.
       */
      repository: {
        /**
         * Name of the referent.
         */
        name: string;
      };
      /**
       * ToPath specifies the path to copy contents to, defaults to the name of
       * the GitRepositoryRef.
       */
      toPath?: string;
    }[];
    /**
     * ObservedRecurseSubmodules is the observed resource submodules
     * configuration used to produce the current Artifact.
     */
    observedRecurseSubmodules?: boolean;
    /**
     * SourceVerificationMode is the last used verification mode indicating
     * which Git object(s) have been verified.
     */
    sourceVerificationMode?: string;
  };
}

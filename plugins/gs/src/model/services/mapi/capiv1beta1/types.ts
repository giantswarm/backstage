/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../metav1';

export const ApiGroup = 'cluster.x-k8s.io';

export const ApiVersion = 'cluster.x-k8s.io/v1beta1';

export const Cluster = 'Cluster';

/**
 * Cluster is the Schema for the clusters API.
 */
export interface ICluster {
  /**
   * APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'cluster.x-k8s.io/v1beta1';
  /**
   * Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: typeof Cluster;
  metadata: metav1.IObjectMeta;
  /**
   * ClusterSpec defines the desired state of Cluster.
   */
  spec?: {
    /**
     * Cluster network configuration.
     */
    clusterNetwork?: {
      /**
       * APIServerPort specifies the port the API Server should bind to. Defaults to 6443.
       */
      apiServerPort?: number;
      /**
       * The network ranges from which Pod networks are allocated.
       */
      pods?: {
        cidrBlocks: string[];
      };
      /**
       * Domain name for services.
       */
      serviceDomain?: string;
      /**
       * The network ranges from which service VIPs are allocated.
       */
      services?: {
        cidrBlocks: string[];
      };
    };
    /**
     * ControlPlaneEndpoint represents the endpoint used to communicate with the control plane.
     */
    controlPlaneEndpoint?: {
      /**
       * The hostname on which the API server is serving.
       */
      host: string;
      /**
       * The port on which the API server is serving.
       */
      port: number;
    };
    /**
     * ControlPlaneRef is an optional reference to a provider-specific resource that holds the details for provisioning the Control Plane for a Cluster.
     */
    controlPlaneRef?: {
      /**
       * API version of the referent.
       */
      apiVersion?: string;
      /**
       * If referring to a piece of an object instead of an entire object, this string should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2]. For example, if the object reference is to a container within a pod, this would take on a value like: "spec.containers{name}" (where "name" refers to the name of the container that triggered the event) or if no container name is specified "spec.containers[2]" (container with index 2 in this pod). This syntax is chosen only to have some well-defined way of referencing a part of an object. TODO: this design is not final and this field is subject to change in the future.
       */
      fieldPath?: string;
      /**
       * Kind of the referent. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
       */
      kind?: string;
      /**
       * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
       */
      name?: string;
      /**
       * Namespace of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
       */
      namespace?: string;
      /**
       * Specific resourceVersion to which this reference is made, if any. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
       */
      resourceVersion?: string;
      /**
       * UID of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
       */
      uid?: string;
    };
    /**
     * InfrastructureRef is a reference to a provider-specific resource that holds the details for provisioning infrastructure for a cluster in said provider.
     */
    infrastructureRef?: {
      /**
       * API version of the referent.
       */
      apiVersion?: string;
      /**
       * If referring to a piece of an object instead of an entire object, this string should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2]. For example, if the object reference is to a container within a pod, this would take on a value like: "spec.containers{name}" (where "name" refers to the name of the container that triggered the event) or if no container name is specified "spec.containers[2]" (container with index 2 in this pod). This syntax is chosen only to have some well-defined way of referencing a part of an object. TODO: this design is not final and this field is subject to change in the future.
       */
      fieldPath?: string;
      /**
       * Kind of the referent. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
       */
      kind?: string;
      /**
       * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
       */
      name?: string;
      /**
       * Namespace of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
       */
      namespace?: string;
      /**
       * Specific resourceVersion to which this reference is made, if any. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
       */
      resourceVersion?: string;
      /**
       * UID of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
       */
      uid?: string;
    };
    /**
     * Paused can be used to prevent controllers from processing the Cluster and all its associated objects.
     */
    paused?: boolean;
    /**
     * This encapsulates the topology for the cluster. NOTE: It is required to enable the ClusterTopology feature gate flag to activate managed topologies support; this feature is highly experimental, and parts of it might still be not implemented.
     */
    topology?: {
      /**
       * The name of the ClusterClass object to create the topology.
       */
      class: string;
      /**
       * ControlPlane describes the cluster control plane.
       */
      controlPlane?: {
        /**
         * MachineHealthCheck allows to enable, disable and override the MachineHealthCheck configuration in the ClusterClass for this control plane.
         */
        machineHealthCheck?: {
          /**
           * Enable controls if a MachineHealthCheck should be created for the target machines.
           *  If false: No MachineHealthCheck will be created.
           *  If not set(default): A MachineHealthCheck will be created if it is defined here or in the associated ClusterClass. If no MachineHealthCheck is defined then none will be created.
           *  If true: A MachineHealthCheck is guaranteed to be created. Cluster validation will block if `enable` is true and no MachineHealthCheck definition is available.
           */
          enable?: boolean;
          /**
           * Any further remediation is only allowed if at most "MaxUnhealthy" machines selected by "selector" are not healthy.
           */
          maxUnhealthy?: number | string;
          /**
           * Machines older than this duration without a node will be considered to have failed and will be remediated. If you wish to disable this feature, set the value explicitly to 0.
           */
          nodeStartupTimeout?: string;
          /**
           * RemediationTemplate is a reference to a remediation template provided by an infrastructure provider.
           *  This field is completely optional, when filled, the MachineHealthCheck controller creates a new object from the template referenced and hands off remediation of the machine to a controller that lives outside of Cluster API.
           */
          remediationTemplate?: {
            /**
             * API version of the referent.
             */
            apiVersion?: string;
            /**
             * If referring to a piece of an object instead of an entire object, this string should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2]. For example, if the object reference is to a container within a pod, this would take on a value like: "spec.containers{name}" (where "name" refers to the name of the container that triggered the event) or if no container name is specified "spec.containers[2]" (container with index 2 in this pod). This syntax is chosen only to have some well-defined way of referencing a part of an object. TODO: this design is not final and this field is subject to change in the future.
             */
            fieldPath?: string;
            /**
             * Kind of the referent. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
             */
            kind?: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
             */
            name?: string;
            /**
             * Namespace of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
             */
            namespace?: string;
            /**
             * Specific resourceVersion to which this reference is made, if any. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
             */
            resourceVersion?: string;
            /**
             * UID of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
             */
            uid?: string;
          };
          /**
           * UnhealthyConditions contains a list of the conditions that determine whether a node is considered unhealthy. The conditions are combined in a logical OR, i.e. if any of the conditions is met, the node is unhealthy.
           */
          unhealthyConditions?: {
            status: string;
            timeout: string;
            type: string;
          }[];
          /**
           * Any further remediation is only allowed if the number of machines selected by "selector" as not healthy is within the range of "UnhealthyRange". Takes precedence over MaxUnhealthy. Eg. "[3-5]" - This means that remediation will be allowed only when: (a) there are at least 3 unhealthy machines (and) (b) there are at most 5 unhealthy machines
           */
          unhealthyRange?: string;
        };
        /**
         * Metadata is the metadata applied to the ControlPlane and the Machines of the ControlPlane if the ControlPlaneTemplate referenced by the ClusterClass is machine based. If not, it is applied only to the ControlPlane. At runtime this metadata is merged with the corresponding metadata from the ClusterClass.
         */
        metadata?: {
          /**
           * Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata. They are not queryable and should be preserved when modifying objects. More info: http://kubernetes.io/docs/user-guide/annotations
           */
          annotations?: {
            [k: string]: string;
          };
          /**
           * Map of string keys and values that can be used to organize and categorize (scope and select) objects. May match selectors of replication controllers and services. More info: http://kubernetes.io/docs/user-guide/labels
           */
          labels?: {
            [k: string]: string;
          };
        };
        /**
         * NodeDeletionTimeout defines how long the controller will attempt to delete the Node that the Machine hosts after the Machine is marked for deletion. A duration of 0 will retry deletion indefinitely. Defaults to 10 seconds.
         */
        nodeDeletionTimeout?: string;
        /**
         * NodeDrainTimeout is the total amount of time that the controller will spend on draining a node. The default value is 0, meaning that the node can be drained without any time limitations. NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
         */
        nodeDrainTimeout?: string;
        /**
         * NodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
         */
        nodeVolumeDetachTimeout?: string;
        /**
         * Replicas is the number of control plane nodes. If the value is nil, the ControlPlane object is created without the number of Replicas and it's assumed that the control plane controller does not implement support for this field. When specified against a control plane provider that lacks support for this field, this value will be ignored.
         */
        replicas?: number;
      };
      /**
       * RolloutAfter performs a rollout of the entire cluster one component at a time, control plane first and then machine deployments.
       *  Deprecated: This field has no function and is going to be removed in the next apiVersion.
       */
      rolloutAfter?: string;
      /**
       * Variables can be used to customize the Cluster through patches. They must comply to the corresponding VariableClasses defined in the ClusterClass.
       */
      variables?: {
        /**
         * DefinitionFrom specifies where the definition of this Variable is from. DefinitionFrom is `inline` when the definition is from the ClusterClass `.spec.variables` or the name of a patch defined in the ClusterClass `.spec.patches` where the patch is external and provides external variables. This field is mandatory if the variable has `DefinitionsConflict: true` in ClusterClass `status.variables[]`
         */
        definitionFrom?: string;
        /**
         * Name of the variable.
         */
        name: string;
        /**
         * Value of the variable. Note: the value will be validated against the schema of the corresponding ClusterClassVariable from the ClusterClass. Note: We have to use apiextensionsv1.JSON instead of a custom JSON type, because controller-tools has a hard-coded schema for apiextensionsv1.JSON which cannot be produced by another type via controller-tools, i.e. it is not possible to have no type field. Ref: https://github.com/kubernetes-sigs/controller-tools/blob/d0e03a142d0ecdd5491593e941ee1d6b5d91dba6/pkg/crd/known_types.go#L106-L111
         */
        value: {
          [k: string]: unknown;
        };
      }[];
      /**
       * The Kubernetes version of the cluster.
       */
      version: string;
      /**
       * Workers encapsulates the different constructs that form the worker nodes for the cluster.
       */
      workers?: {
        /**
         * MachineDeployments is a list of machine deployments in the cluster.
         */
        machineDeployments?: {
          /**
           * Class is the name of the MachineDeploymentClass used to create the set of worker nodes. This should match one of the deployment classes defined in the ClusterClass object mentioned in the `Cluster.Spec.Class` field.
           */
          class: string;
          /**
           * FailureDomain is the failure domain the machines will be created in. Must match a key in the FailureDomains map stored on the cluster object.
           */
          failureDomain?: string;
          /**
           * MachineHealthCheck allows to enable, disable and override the MachineHealthCheck configuration in the ClusterClass for this MachineDeployment.
           */
          machineHealthCheck?: {
            /**
             * Enable controls if a MachineHealthCheck should be created for the target machines.
             *  If false: No MachineHealthCheck will be created.
             *  If not set(default): A MachineHealthCheck will be created if it is defined here or in the associated ClusterClass. If no MachineHealthCheck is defined then none will be created.
             *  If true: A MachineHealthCheck is guaranteed to be created. Cluster validation will block if `enable` is true and no MachineHealthCheck definition is available.
             */
            enable?: boolean;
            /**
             * Any further remediation is only allowed if at most "MaxUnhealthy" machines selected by "selector" are not healthy.
             */
            maxUnhealthy?: number | string;
            /**
             * Machines older than this duration without a node will be considered to have failed and will be remediated. If you wish to disable this feature, set the value explicitly to 0.
             */
            nodeStartupTimeout?: string;
            /**
             * RemediationTemplate is a reference to a remediation template provided by an infrastructure provider.
             *  This field is completely optional, when filled, the MachineHealthCheck controller creates a new object from the template referenced and hands off remediation of the machine to a controller that lives outside of Cluster API.
             */
            remediationTemplate?: {
              /**
               * API version of the referent.
               */
              apiVersion?: string;
              /**
               * If referring to a piece of an object instead of an entire object, this string should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2]. For example, if the object reference is to a container within a pod, this would take on a value like: "spec.containers{name}" (where "name" refers to the name of the container that triggered the event) or if no container name is specified "spec.containers[2]" (container with index 2 in this pod). This syntax is chosen only to have some well-defined way of referencing a part of an object. TODO: this design is not final and this field is subject to change in the future.
               */
              fieldPath?: string;
              /**
               * Kind of the referent. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
               */
              kind?: string;
              /**
               * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
               */
              name?: string;
              /**
               * Namespace of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
               */
              namespace?: string;
              /**
               * Specific resourceVersion to which this reference is made, if any. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
               */
              resourceVersion?: string;
              /**
               * UID of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
               */
              uid?: string;
            };
            /**
             * UnhealthyConditions contains a list of the conditions that determine whether a node is considered unhealthy. The conditions are combined in a logical OR, i.e. if any of the conditions is met, the node is unhealthy.
             */
            unhealthyConditions?: {
              status: string;
              timeout: string;
              type: string;
            }[];
            /**
             * Any further remediation is only allowed if the number of machines selected by "selector" as not healthy is within the range of "UnhealthyRange". Takes precedence over MaxUnhealthy. Eg. "[3-5]" - This means that remediation will be allowed only when: (a) there are at least 3 unhealthy machines (and) (b) there are at most 5 unhealthy machines
             */
            unhealthyRange?: string;
          };
          /**
           * Metadata is the metadata applied to the MachineDeployment and the machines of the MachineDeployment. At runtime this metadata is merged with the corresponding metadata from the ClusterClass.
           */
          metadata?: {
            /**
             * Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata. They are not queryable and should be preserved when modifying objects. More info: http://kubernetes.io/docs/user-guide/annotations
             */
            annotations?: {
              [k: string]: string;
            };
            /**
             * Map of string keys and values that can be used to organize and categorize (scope and select) objects. May match selectors of replication controllers and services. More info: http://kubernetes.io/docs/user-guide/labels
             */
            labels?: {
              [k: string]: string;
            };
          };
          /**
           * Minimum number of seconds for which a newly created machine should be ready. Defaults to 0 (machine will be considered available as soon as it is ready)
           */
          minReadySeconds?: number;
          /**
           * Name is the unique identifier for this MachineDeploymentTopology. The value is used with other unique identifiers to create a MachineDeployment's Name (e.g. cluster's name, etc). In case the name is greater than the allowed maximum length, the values are hashed together.
           */
          name: string;
          /**
           * NodeDeletionTimeout defines how long the controller will attempt to delete the Node that the Machine hosts after the Machine is marked for deletion. A duration of 0 will retry deletion indefinitely. Defaults to 10 seconds.
           */
          nodeDeletionTimeout?: string;
          /**
           * NodeDrainTimeout is the total amount of time that the controller will spend on draining a node. The default value is 0, meaning that the node can be drained without any time limitations. NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
           */
          nodeDrainTimeout?: string;
          /**
           * NodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
           */
          nodeVolumeDetachTimeout?: string;
          /**
           * Replicas is the number of worker nodes belonging to this set. If the value is nil, the MachineDeployment is created without the number of Replicas (defaulting to 1) and it's assumed that an external entity (like cluster autoscaler) is responsible for the management of this value.
           */
          replicas?: number;
          /**
           * The deployment strategy to use to replace existing machines with new ones.
           */
          strategy?: {
            /**
             * Rolling update config params. Present only if MachineDeploymentStrategyType = RollingUpdate.
             */
            rollingUpdate?: {
              /**
               * DeletePolicy defines the policy used by the MachineDeployment to identify nodes to delete when downscaling. Valid values are "Random, "Newest", "Oldest" When no value is supplied, the default DeletePolicy of MachineSet is used
               */
              deletePolicy?: 'Random' | 'Newest' | 'Oldest';
              /**
               * The maximum number of machines that can be scheduled above the desired number of machines. Value can be an absolute number (ex: 5) or a percentage of desired machines (ex: 10%). This can not be 0 if MaxUnavailable is 0. Absolute number is calculated from percentage by rounding up. Defaults to 1. Example: when this is set to 30%, the new MachineSet can be scaled up immediately when the rolling update starts, such that the total number of old and new machines do not exceed 130% of desired machines. Once old machines have been killed, new MachineSet can be scaled up further, ensuring that total number of machines running at any time during the update is at most 130% of desired machines.
               */
              maxSurge?: number | string;
              /**
               * The maximum number of machines that can be unavailable during the update. Value can be an absolute number (ex: 5) or a percentage of desired machines (ex: 10%). Absolute number is calculated from percentage by rounding down. This can not be 0 if MaxSurge is 0. Defaults to 0. Example: when this is set to 30%, the old MachineSet can be scaled down to 70% of desired machines immediately when the rolling update starts. Once new machines are ready, old MachineSet can be scaled down further, followed by scaling up the new MachineSet, ensuring that the total number of machines available at all times during the update is at least 70% of desired machines.
               */
              maxUnavailable?: number | string;
            };
            /**
             * Type of deployment. Allowed values are RollingUpdate and OnDelete. The default is RollingUpdate.
             */
            type?: 'RollingUpdate' | 'OnDelete';
          };
          /**
           * Variables can be used to customize the MachineDeployment through patches.
           */
          variables?: {
            /**
             * Overrides can be used to override Cluster level variables.
             */
            overrides?: {
              /**
               * DefinitionFrom specifies where the definition of this Variable is from. DefinitionFrom is `inline` when the definition is from the ClusterClass `.spec.variables` or the name of a patch defined in the ClusterClass `.spec.patches` where the patch is external and provides external variables. This field is mandatory if the variable has `DefinitionsConflict: true` in ClusterClass `status.variables[]`
               */
              definitionFrom?: string;
              /**
               * Name of the variable.
               */
              name: string;
              /**
               * Value of the variable. Note: the value will be validated against the schema of the corresponding ClusterClassVariable from the ClusterClass. Note: We have to use apiextensionsv1.JSON instead of a custom JSON type, because controller-tools has a hard-coded schema for apiextensionsv1.JSON which cannot be produced by another type via controller-tools, i.e. it is not possible to have no type field. Ref: https://github.com/kubernetes-sigs/controller-tools/blob/d0e03a142d0ecdd5491593e941ee1d6b5d91dba6/pkg/crd/known_types.go#L106-L111
               */
              value: {
                [k: string]: unknown;
              };
            }[];
          };
        }[];
        /**
         * MachinePools is a list of machine pools in the cluster.
         */
        machinePools?: {
          /**
           * Class is the name of the MachinePoolClass used to create the pool of worker nodes. This should match one of the deployment classes defined in the ClusterClass object mentioned in the `Cluster.Spec.Class` field.
           */
          class: string;
          /**
           * FailureDomains is the list of failure domains the machine pool will be created in. Must match a key in the FailureDomains map stored on the cluster object.
           */
          failureDomains?: string[];
          /**
           * Metadata is the metadata applied to the MachinePool. At runtime this metadata is merged with the corresponding metadata from the ClusterClass.
           */
          metadata?: {
            /**
             * Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata. They are not queryable and should be preserved when modifying objects. More info: http://kubernetes.io/docs/user-guide/annotations
             */
            annotations?: {
              [k: string]: string;
            };
            /**
             * Map of string keys and values that can be used to organize and categorize (scope and select) objects. May match selectors of replication controllers and services. More info: http://kubernetes.io/docs/user-guide/labels
             */
            labels?: {
              [k: string]: string;
            };
          };
          /**
           * Minimum number of seconds for which a newly created machine pool should be ready. Defaults to 0 (machine will be considered available as soon as it is ready)
           */
          minReadySeconds?: number;
          /**
           * Name is the unique identifier for this MachinePoolTopology. The value is used with other unique identifiers to create a MachinePool's Name (e.g. cluster's name, etc). In case the name is greater than the allowed maximum length, the values are hashed together.
           */
          name: string;
          /**
           * NodeDeletionTimeout defines how long the controller will attempt to delete the Node that the MachinePool hosts after the MachinePool is marked for deletion. A duration of 0 will retry deletion indefinitely. Defaults to 10 seconds.
           */
          nodeDeletionTimeout?: string;
          /**
           * NodeDrainTimeout is the total amount of time that the controller will spend on draining a node. The default value is 0, meaning that the node can be drained without any time limitations. NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
           */
          nodeDrainTimeout?: string;
          /**
           * NodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
           */
          nodeVolumeDetachTimeout?: string;
          /**
           * Replicas is the number of nodes belonging to this pool. If the value is nil, the MachinePool is created without the number of Replicas (defaulting to 1) and it's assumed that an external entity (like cluster autoscaler) is responsible for the management of this value.
           */
          replicas?: number;
          /**
           * Variables can be used to customize the MachinePool through patches.
           */
          variables?: {
            /**
             * Overrides can be used to override Cluster level variables.
             */
            overrides?: {
              /**
               * DefinitionFrom specifies where the definition of this Variable is from. DefinitionFrom is `inline` when the definition is from the ClusterClass `.spec.variables` or the name of a patch defined in the ClusterClass `.spec.patches` where the patch is external and provides external variables. This field is mandatory if the variable has `DefinitionsConflict: true` in ClusterClass `status.variables[]`
               */
              definitionFrom?: string;
              /**
               * Name of the variable.
               */
              name: string;
              /**
               * Value of the variable. Note: the value will be validated against the schema of the corresponding ClusterClassVariable from the ClusterClass. Note: We have to use apiextensionsv1.JSON instead of a custom JSON type, because controller-tools has a hard-coded schema for apiextensionsv1.JSON which cannot be produced by another type via controller-tools, i.e. it is not possible to have no type field. Ref: https://github.com/kubernetes-sigs/controller-tools/blob/d0e03a142d0ecdd5491593e941ee1d6b5d91dba6/pkg/crd/known_types.go#L106-L111
               */
              value: {
                [k: string]: unknown;
              };
            }[];
          };
        }[];
      };
    };
  };
  /**
   * ClusterStatus defines the observed state of Cluster.
   */
  status?: {
    /**
     * Conditions defines current service state of the cluster.
     */
    conditions?: {
      /**
       * Last time the condition transitioned from one status to another. This should be when the underlying condition changed. If that is not known, then using the time when the API field changed is acceptable.
       */
      lastTransitionTime: string;
      /**
       * A human readable message indicating details about the transition. This field may be empty.
       */
      message?: string;
      /**
       * The reason for the condition's last transition in CamelCase. The specific API may choose whether or not this field is considered a guaranteed API. This field may not be empty.
       */
      reason?: string;
      /**
       * Severity provides an explicit classification of Reason code, so the users or machines can immediately understand the current situation and act accordingly. The Severity field MUST be set only when Status=False.
       */
      severity?: string;
      /**
       * Status of the condition, one of True, False, Unknown.
       */
      status: string;
      /**
       * Type of condition in CamelCase or in foo.example.com/CamelCase. Many .condition.type values are consistent across resources like Available, but because arbitrary conditions can be useful (see .node.status.conditions), the ability to deconflict is important.
       */
      type: string;
    }[];
    /**
     * ControlPlaneReady defines if the control plane is ready.
     */
    controlPlaneReady?: boolean;
    /**
     * FailureDomains is a slice of failure domain objects synced from the infrastructure provider.
     */
    failureDomains?: {
      /**
       * FailureDomainSpec is the Schema for Cluster API failure domains. It allows controllers to understand how many failure domains a cluster can optionally span across.
       */
      [k: string]: {
        /**
         * Attributes is a free form map of attributes an infrastructure provider might use or require.
         */
        attributes?: {
          [k: string]: string;
        };
        /**
         * ControlPlane determines if this failure domain is suitable for use by control plane machines.
         */
        controlPlane?: boolean;
      };
    };
    /**
     * FailureMessage indicates that there is a fatal problem reconciling the state, and will be set to a descriptive error message.
     */
    failureMessage?: string;
    /**
     * FailureReason indicates that there is a fatal problem reconciling the state, and will be set to a token value suitable for programmatic interpretation.
     */
    failureReason?: string;
    /**
     * InfrastructureReady is the state of the infrastructure provider.
     */
    infrastructureReady?: boolean;
    /**
     * ObservedGeneration is the latest generation observed by the controller.
     */
    observedGeneration?: number;
    /**
     * Phase represents the current phase of cluster actuation. E.g. Pending, Running, Terminating, Failed etc.
     */
    phase?: string;
  };
}

export const ClusterList = 'ClusterList';

export interface IClusterList extends metav1.IList<ICluster> {
  apiVersion: 'cluster.x-k8s.io/v1beta1';
  kind: typeof ClusterList;
}

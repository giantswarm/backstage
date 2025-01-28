/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * Cluster is the Schema for the clusters API.
 */
export interface ICluster {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1beta1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'Cluster';
  metadata: metav1.IObjectMeta;
  /**
   * ClusterSpec defines the desired state of Cluster.
   */
  spec?: {
    /**
     * availabilityGates specifies additional conditions to include when evaluating Cluster Available condition.
     *
     * NOTE: this field is considered only for computing v1beta2 conditions.
     *
     * @maxItems 32
     */
    availabilityGates?: {
      /**
       * conditionType refers to a positive polarity condition (status true means good) with matching type in the Cluster's condition list.
       * If the conditions doesn't exist, it will be treated as unknown.
       * Note: Both Cluster API conditions or conditions added by 3rd party controllers can be used as availability gates.
       */
      conditionType: string;
    }[];
    /**
     * clusterNetwork represents the cluster network configuration.
     */
    clusterNetwork?: {
      /**
       * apiServerPort specifies the port the API Server should bind to.
       * Defaults to 6443.
       */
      apiServerPort?: number;
      /**
       * pods is the network ranges from which Pod networks are allocated.
       */
      pods?: {
        cidrBlocks: string[];
      };
      /**
       * serviceDomain is the domain name for services.
       */
      serviceDomain?: string;
      /**
       * services is the network ranges from which service VIPs are allocated.
       */
      services?: {
        cidrBlocks: string[];
      };
    };
    /**
     * controlPlaneEndpoint represents the endpoint used to communicate with the control plane.
     */
    controlPlaneEndpoint?: {
      /**
       * host is the hostname on which the API server is serving.
       */
      host: string;
      /**
       * port is the port on which the API server is serving.
       */
      port: number;
    };
    /**
     * controlPlaneRef is an optional reference to a provider-specific resource that holds
     * the details for provisioning the Control Plane for a Cluster.
     */
    controlPlaneRef?: {
      /**
       * API version of the referent.
       */
      apiVersion?: string;
      /**
       * If referring to a piece of an object instead of an entire object, this string
       * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
       * For example, if the object reference is to a container within a pod, this would take on a value like:
       * "spec.containers{name}" (where "name" refers to the name of the container that triggered
       * the event) or if no container name is specified "spec.containers[2]" (container with
       * index 2 in this pod). This syntax is chosen only to have some well-defined way of
       * referencing a part of an object.
       */
      fieldPath?: string;
      /**
       * Kind of the referent.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
       */
      kind?: string;
      /**
       * Name of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
       */
      name?: string;
      /**
       * Namespace of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
       */
      namespace?: string;
      /**
       * Specific resourceVersion to which this reference is made, if any.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
       */
      resourceVersion?: string;
      /**
       * UID of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
       */
      uid?: string;
    };
    /**
     * infrastructureRef is a reference to a provider-specific resource that holds the details
     * for provisioning infrastructure for a cluster in said provider.
     */
    infrastructureRef?: {
      /**
       * API version of the referent.
       */
      apiVersion?: string;
      /**
       * If referring to a piece of an object instead of an entire object, this string
       * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
       * For example, if the object reference is to a container within a pod, this would take on a value like:
       * "spec.containers{name}" (where "name" refers to the name of the container that triggered
       * the event) or if no container name is specified "spec.containers[2]" (container with
       * index 2 in this pod). This syntax is chosen only to have some well-defined way of
       * referencing a part of an object.
       */
      fieldPath?: string;
      /**
       * Kind of the referent.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
       */
      kind?: string;
      /**
       * Name of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
       */
      name?: string;
      /**
       * Namespace of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
       */
      namespace?: string;
      /**
       * Specific resourceVersion to which this reference is made, if any.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
       */
      resourceVersion?: string;
      /**
       * UID of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
       */
      uid?: string;
    };
    /**
     * paused can be used to prevent controllers from processing the Cluster and all its associated objects.
     */
    paused?: boolean;
    /**
     * This encapsulates the topology for the cluster.
     * NOTE: It is required to enable the ClusterTopology
     * feature gate flag to activate managed topologies support;
     * this feature is highly experimental, and parts of it might still be not implemented.
     */
    topology?: {
      /**
       * class is the name of the ClusterClass object to create the topology.
       */
      class: string;
      /**
       * classNamespace is the namespace of the ClusterClass object to create the topology.
       * If the namespace is empty or not set, it is defaulted to the namespace of the cluster object.
       * Value must follow the DNS1123Subdomain syntax.
       */
      classNamespace?: string;
      /**
       * controlPlane describes the cluster control plane.
       */
      controlPlane?: {
        /**
         * machineHealthCheck allows to enable, disable and override
         * the MachineHealthCheck configuration in the ClusterClass for this control plane.
         */
        machineHealthCheck?: {
          /**
           * enable controls if a MachineHealthCheck should be created for the target machines.
           *
           * If false: No MachineHealthCheck will be created.
           *
           * If not set(default): A MachineHealthCheck will be created if it is defined here or
           *  in the associated ClusterClass. If no MachineHealthCheck is defined then none will be created.
           *
           * If true: A MachineHealthCheck is guaranteed to be created. Cluster validation will
           * block if `enable` is true and no MachineHealthCheck definition is available.
           */
          enable?: boolean;
          /**
           * Any further remediation is only allowed if at most "MaxUnhealthy" machines selected by
           * "selector" are not healthy.
           */
          maxUnhealthy?: number | string;
          /**
           * nodeStartupTimeout allows to set the maximum time for MachineHealthCheck
           * to consider a Machine unhealthy if a corresponding Node isn't associated
           * through a `Spec.ProviderID` field.
           *
           * The duration set in this field is compared to the greatest of:
           * - Cluster's infrastructure ready condition timestamp (if and when available)
           * - Control Plane's initialized condition timestamp (if and when available)
           * - Machine's infrastructure ready condition timestamp (if and when available)
           * - Machine's metadata creation timestamp
           *
           * Defaults to 10 minutes.
           * If you wish to disable this feature, set the value explicitly to 0.
           */
          nodeStartupTimeout?: string;
          /**
           * remediationTemplate is a reference to a remediation template
           * provided by an infrastructure provider.
           *
           * This field is completely optional, when filled, the MachineHealthCheck controller
           * creates a new object from the template referenced and hands off remediation of the machine to
           * a controller that lives outside of Cluster API.
           */
          remediationTemplate?: {
            /**
             * API version of the referent.
             */
            apiVersion?: string;
            /**
             * If referring to a piece of an object instead of an entire object, this string
             * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
             * For example, if the object reference is to a container within a pod, this would take on a value like:
             * "spec.containers{name}" (where "name" refers to the name of the container that triggered
             * the event) or if no container name is specified "spec.containers[2]" (container with
             * index 2 in this pod). This syntax is chosen only to have some well-defined way of
             * referencing a part of an object.
             */
            fieldPath?: string;
            /**
             * Kind of the referent.
             * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
             */
            kind?: string;
            /**
             * Name of the referent.
             * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
             */
            name?: string;
            /**
             * Namespace of the referent.
             * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
             */
            namespace?: string;
            /**
             * Specific resourceVersion to which this reference is made, if any.
             * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
             */
            resourceVersion?: string;
            /**
             * UID of the referent.
             * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
             */
            uid?: string;
          };
          /**
           * unhealthyConditions contains a list of the conditions that determine
           * whether a node is considered unhealthy. The conditions are combined in a
           * logical OR, i.e. if any of the conditions is met, the node is unhealthy.
           */
          unhealthyConditions?: {
            status: string;
            timeout: string;
            type: string;
          }[];
          /**
           * Any further remediation is only allowed if the number of machines selected by "selector" as not healthy
           * is within the range of "UnhealthyRange". Takes precedence over MaxUnhealthy.
           * Eg. "[3-5]" - This means that remediation will be allowed only when:
           * (a) there are at least 3 unhealthy machines (and)
           * (b) there are at most 5 unhealthy machines
           */
          unhealthyRange?: string;
        };
        /**
         * metadata is the metadata applied to the ControlPlane and the Machines of the ControlPlane
         * if the ControlPlaneTemplate referenced by the ClusterClass is machine based. If not, it
         * is applied only to the ControlPlane.
         * At runtime this metadata is merged with the corresponding metadata from the ClusterClass.
         */
        metadata?: {
          /**
           * annotations is an unstructured key value map stored with a resource that may be
           * set by external tools to store and retrieve arbitrary metadata. They are not
           * queryable and should be preserved when modifying objects.
           * More info: http://kubernetes.io/docs/user-guide/annotations
           */
          annotations?: {
            [k: string]: string;
          };
          /**
           * labels is a map of string keys and values that can be used to organize and categorize
           * (scope and select) objects. May match selectors of replication controllers
           * and services.
           * More info: http://kubernetes.io/docs/user-guide/labels
           */
          labels?: {
            [k: string]: string;
          };
        };
        /**
         * nodeDeletionTimeout defines how long the controller will attempt to delete the Node that the Machine
         * hosts after the Machine is marked for deletion. A duration of 0 will retry deletion indefinitely.
         * Defaults to 10 seconds.
         */
        nodeDeletionTimeout?: string;
        /**
         * nodeDrainTimeout is the total amount of time that the controller will spend on draining a node.
         * The default value is 0, meaning that the node can be drained without any time limitations.
         * NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
         */
        nodeDrainTimeout?: string;
        /**
         * nodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes
         * to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
         */
        nodeVolumeDetachTimeout?: string;
        /**
         * replicas is the number of control plane nodes.
         * If the value is nil, the ControlPlane object is created without the number of Replicas
         * and it's assumed that the control plane controller does not implement support for this field.
         * When specified against a control plane provider that lacks support for this field, this value will be ignored.
         */
        replicas?: number;
        /**
         * variables can be used to customize the ControlPlane through patches.
         */
        variables?: {
          /**
           * overrides can be used to override Cluster level variables.
           */
          overrides?: {
            /**
             * definitionFrom specifies where the definition of this Variable is from.
             *
             * Deprecated: This field is deprecated, must not be set anymore and is going to be removed in the next apiVersion.
             */
            definitionFrom?: string;
            /**
             * name of the variable.
             */
            name: string;
            /**
             * value of the variable.
             * Note: the value will be validated against the schema of the corresponding ClusterClassVariable
             * from the ClusterClass.
             * Note: We have to use apiextensionsv1.JSON instead of a custom JSON type, because controller-tools has a
             * hard-coded schema for apiextensionsv1.JSON which cannot be produced by another type via controller-tools,
             * i.e. it is not possible to have no type field.
             * Ref: https://github.com/kubernetes-sigs/controller-tools/blob/d0e03a142d0ecdd5491593e941ee1d6b5d91dba6/pkg/crd/known_types.go#L106-L111
             */
            value: {
              [k: string]: unknown;
            };
          }[];
        };
      };
      /**
       * rolloutAfter performs a rollout of the entire cluster one component at a time,
       * control plane first and then machine deployments.
       *
       * Deprecated: This field has no function and is going to be removed in the next apiVersion.
       */
      rolloutAfter?: string;
      /**
       * variables can be used to customize the Cluster through
       * patches. They must comply to the corresponding
       * VariableClasses defined in the ClusterClass.
       */
      variables?: {
        /**
         * definitionFrom specifies where the definition of this Variable is from.
         *
         * Deprecated: This field is deprecated, must not be set anymore and is going to be removed in the next apiVersion.
         */
        definitionFrom?: string;
        /**
         * name of the variable.
         */
        name: string;
        /**
         * value of the variable.
         * Note: the value will be validated against the schema of the corresponding ClusterClassVariable
         * from the ClusterClass.
         * Note: We have to use apiextensionsv1.JSON instead of a custom JSON type, because controller-tools has a
         * hard-coded schema for apiextensionsv1.JSON which cannot be produced by another type via controller-tools,
         * i.e. it is not possible to have no type field.
         * Ref: https://github.com/kubernetes-sigs/controller-tools/blob/d0e03a142d0ecdd5491593e941ee1d6b5d91dba6/pkg/crd/known_types.go#L106-L111
         */
        value: {
          [k: string]: unknown;
        };
      }[];
      /**
       * version is the Kubernetes version of the cluster.
       */
      version: string;
      /**
       * workers encapsulates the different constructs that form the worker nodes
       * for the cluster.
       */
      workers?: {
        /**
         * machineDeployments is a list of machine deployments in the cluster.
         */
        machineDeployments?: {
          /**
           * class is the name of the MachineDeploymentClass used to create the set of worker nodes.
           * This should match one of the deployment classes defined in the ClusterClass object
           * mentioned in the `Cluster.Spec.Class` field.
           */
          class: string;
          /**
           * failureDomain is the failure domain the machines will be created in.
           * Must match a key in the FailureDomains map stored on the cluster object.
           */
          failureDomain?: string;
          /**
           * machineHealthCheck allows to enable, disable and override
           * the MachineHealthCheck configuration in the ClusterClass for this MachineDeployment.
           */
          machineHealthCheck?: {
            /**
             * enable controls if a MachineHealthCheck should be created for the target machines.
             *
             * If false: No MachineHealthCheck will be created.
             *
             * If not set(default): A MachineHealthCheck will be created if it is defined here or
             *  in the associated ClusterClass. If no MachineHealthCheck is defined then none will be created.
             *
             * If true: A MachineHealthCheck is guaranteed to be created. Cluster validation will
             * block if `enable` is true and no MachineHealthCheck definition is available.
             */
            enable?: boolean;
            /**
             * Any further remediation is only allowed if at most "MaxUnhealthy" machines selected by
             * "selector" are not healthy.
             */
            maxUnhealthy?: number | string;
            /**
             * nodeStartupTimeout allows to set the maximum time for MachineHealthCheck
             * to consider a Machine unhealthy if a corresponding Node isn't associated
             * through a `Spec.ProviderID` field.
             *
             * The duration set in this field is compared to the greatest of:
             * - Cluster's infrastructure ready condition timestamp (if and when available)
             * - Control Plane's initialized condition timestamp (if and when available)
             * - Machine's infrastructure ready condition timestamp (if and when available)
             * - Machine's metadata creation timestamp
             *
             * Defaults to 10 minutes.
             * If you wish to disable this feature, set the value explicitly to 0.
             */
            nodeStartupTimeout?: string;
            /**
             * remediationTemplate is a reference to a remediation template
             * provided by an infrastructure provider.
             *
             * This field is completely optional, when filled, the MachineHealthCheck controller
             * creates a new object from the template referenced and hands off remediation of the machine to
             * a controller that lives outside of Cluster API.
             */
            remediationTemplate?: {
              /**
               * API version of the referent.
               */
              apiVersion?: string;
              /**
               * If referring to a piece of an object instead of an entire object, this string
               * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
               * For example, if the object reference is to a container within a pod, this would take on a value like:
               * "spec.containers{name}" (where "name" refers to the name of the container that triggered
               * the event) or if no container name is specified "spec.containers[2]" (container with
               * index 2 in this pod). This syntax is chosen only to have some well-defined way of
               * referencing a part of an object.
               */
              fieldPath?: string;
              /**
               * Kind of the referent.
               * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
               */
              kind?: string;
              /**
               * Name of the referent.
               * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
               */
              name?: string;
              /**
               * Namespace of the referent.
               * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
               */
              namespace?: string;
              /**
               * Specific resourceVersion to which this reference is made, if any.
               * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
               */
              resourceVersion?: string;
              /**
               * UID of the referent.
               * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
               */
              uid?: string;
            };
            /**
             * unhealthyConditions contains a list of the conditions that determine
             * whether a node is considered unhealthy. The conditions are combined in a
             * logical OR, i.e. if any of the conditions is met, the node is unhealthy.
             */
            unhealthyConditions?: {
              status: string;
              timeout: string;
              type: string;
            }[];
            /**
             * Any further remediation is only allowed if the number of machines selected by "selector" as not healthy
             * is within the range of "UnhealthyRange". Takes precedence over MaxUnhealthy.
             * Eg. "[3-5]" - This means that remediation will be allowed only when:
             * (a) there are at least 3 unhealthy machines (and)
             * (b) there are at most 5 unhealthy machines
             */
            unhealthyRange?: string;
          };
          /**
           * metadata is the metadata applied to the MachineDeployment and the machines of the MachineDeployment.
           * At runtime this metadata is merged with the corresponding metadata from the ClusterClass.
           */
          metadata?: {
            /**
             * annotations is an unstructured key value map stored with a resource that may be
             * set by external tools to store and retrieve arbitrary metadata. They are not
             * queryable and should be preserved when modifying objects.
             * More info: http://kubernetes.io/docs/user-guide/annotations
             */
            annotations?: {
              [k: string]: string;
            };
            /**
             * labels is a map of string keys and values that can be used to organize and categorize
             * (scope and select) objects. May match selectors of replication controllers
             * and services.
             * More info: http://kubernetes.io/docs/user-guide/labels
             */
            labels?: {
              [k: string]: string;
            };
          };
          /**
           * minReadySeconds is the minimum number of seconds for which a newly created machine should
           * be ready.
           * Defaults to 0 (machine will be considered available as soon as it
           * is ready)
           */
          minReadySeconds?: number;
          /**
           * name is the unique identifier for this MachineDeploymentTopology.
           * The value is used with other unique identifiers to create a MachineDeployment's Name
           * (e.g. cluster's name, etc). In case the name is greater than the allowed maximum length,
           * the values are hashed together.
           */
          name: string;
          /**
           * nodeDeletionTimeout defines how long the controller will attempt to delete the Node that the Machine
           * hosts after the Machine is marked for deletion. A duration of 0 will retry deletion indefinitely.
           * Defaults to 10 seconds.
           */
          nodeDeletionTimeout?: string;
          /**
           * nodeDrainTimeout is the total amount of time that the controller will spend on draining a node.
           * The default value is 0, meaning that the node can be drained without any time limitations.
           * NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
           */
          nodeDrainTimeout?: string;
          /**
           * nodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes
           * to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
           */
          nodeVolumeDetachTimeout?: string;
          /**
           * replicas is the number of worker nodes belonging to this set.
           * If the value is nil, the MachineDeployment is created without the number of Replicas (defaulting to 1)
           * and it's assumed that an external entity (like cluster autoscaler) is responsible for the management
           * of this value.
           */
          replicas?: number;
          /**
           * strategy is the deployment strategy to use to replace existing machines with
           * new ones.
           */
          strategy?: {
            /**
             * remediation controls the strategy of remediating unhealthy machines
             * and how remediating operations should occur during the lifecycle of the dependant MachineSets.
             */
            remediation?: {
              /**
               * maxInFlight determines how many in flight remediations should happen at the same time.
               *
               * Remediation only happens on the MachineSet with the most current revision, while
               * older MachineSets (usually present during rollout operations) aren't allowed to remediate.
               *
               * Note: In general (independent of remediations), unhealthy machines are always
               * prioritized during scale down operations over healthy ones.
               *
               * MaxInFlight can be set to a fixed number or a percentage.
               * Example: when this is set to 20%, the MachineSet controller deletes at most 20% of
               * the desired replicas.
               *
               * If not set, remediation is limited to all machines (bounded by replicas)
               * under the active MachineSet's management.
               */
              maxInFlight?: number | string;
            };
            /**
             * rollingUpdate is the rolling update config params. Present only if
             * MachineDeploymentStrategyType = RollingUpdate.
             */
            rollingUpdate?: {
              /**
               * deletePolicy defines the policy used by the MachineDeployment to identify nodes to delete when downscaling.
               * Valid values are "Random, "Newest", "Oldest"
               * When no value is supplied, the default DeletePolicy of MachineSet is used
               */
              deletePolicy?: 'Random' | 'Newest' | 'Oldest';
              /**
               * maxSurge is the maximum number of machines that can be scheduled above the
               * desired number of machines.
               * Value can be an absolute number (ex: 5) or a percentage of
               * desired machines (ex: 10%).
               * This can not be 0 if MaxUnavailable is 0.
               * Absolute number is calculated from percentage by rounding up.
               * Defaults to 1.
               * Example: when this is set to 30%, the new MachineSet can be scaled
               * up immediately when the rolling update starts, such that the total
               * number of old and new machines do not exceed 130% of desired
               * machines. Once old machines have been killed, new MachineSet can
               * be scaled up further, ensuring that total number of machines running
               * at any time during the update is at most 130% of desired machines.
               */
              maxSurge?: number | string;
              /**
               * maxUnavailable is the maximum number of machines that can be unavailable during the update.
               * Value can be an absolute number (ex: 5) or a percentage of desired
               * machines (ex: 10%).
               * Absolute number is calculated from percentage by rounding down.
               * This can not be 0 if MaxSurge is 0.
               * Defaults to 0.
               * Example: when this is set to 30%, the old MachineSet can be scaled
               * down to 70% of desired machines immediately when the rolling update
               * starts. Once new machines are ready, old MachineSet can be scaled
               * down further, followed by scaling up the new MachineSet, ensuring
               * that the total number of machines available at all times
               * during the update is at least 70% of desired machines.
               */
              maxUnavailable?: number | string;
            };
            /**
             * type of deployment. Allowed values are RollingUpdate and OnDelete.
             * The default is RollingUpdate.
             */
            type?: 'RollingUpdate' | 'OnDelete';
          };
          /**
           * variables can be used to customize the MachineDeployment through patches.
           */
          variables?: {
            /**
             * overrides can be used to override Cluster level variables.
             */
            overrides?: {
              /**
               * definitionFrom specifies where the definition of this Variable is from.
               *
               * Deprecated: This field is deprecated, must not be set anymore and is going to be removed in the next apiVersion.
               */
              definitionFrom?: string;
              /**
               * name of the variable.
               */
              name: string;
              /**
               * value of the variable.
               * Note: the value will be validated against the schema of the corresponding ClusterClassVariable
               * from the ClusterClass.
               * Note: We have to use apiextensionsv1.JSON instead of a custom JSON type, because controller-tools has a
               * hard-coded schema for apiextensionsv1.JSON which cannot be produced by another type via controller-tools,
               * i.e. it is not possible to have no type field.
               * Ref: https://github.com/kubernetes-sigs/controller-tools/blob/d0e03a142d0ecdd5491593e941ee1d6b5d91dba6/pkg/crd/known_types.go#L106-L111
               */
              value: {
                [k: string]: unknown;
              };
            }[];
          };
        }[];
        /**
         * machinePools is a list of machine pools in the cluster.
         */
        machinePools?: {
          /**
           * class is the name of the MachinePoolClass used to create the pool of worker nodes.
           * This should match one of the deployment classes defined in the ClusterClass object
           * mentioned in the `Cluster.Spec.Class` field.
           */
          class: string;
          /**
           * failureDomains is the list of failure domains the machine pool will be created in.
           * Must match a key in the FailureDomains map stored on the cluster object.
           */
          failureDomains?: string[];
          /**
           * metadata is the metadata applied to the MachinePool.
           * At runtime this metadata is merged with the corresponding metadata from the ClusterClass.
           */
          metadata?: {
            /**
             * annotations is an unstructured key value map stored with a resource that may be
             * set by external tools to store and retrieve arbitrary metadata. They are not
             * queryable and should be preserved when modifying objects.
             * More info: http://kubernetes.io/docs/user-guide/annotations
             */
            annotations?: {
              [k: string]: string;
            };
            /**
             * labels is a map of string keys and values that can be used to organize and categorize
             * (scope and select) objects. May match selectors of replication controllers
             * and services.
             * More info: http://kubernetes.io/docs/user-guide/labels
             */
            labels?: {
              [k: string]: string;
            };
          };
          /**
           * minReadySeconds is the minimum number of seconds for which a newly created machine pool should
           * be ready.
           * Defaults to 0 (machine will be considered available as soon as it
           * is ready)
           */
          minReadySeconds?: number;
          /**
           * name is the unique identifier for this MachinePoolTopology.
           * The value is used with other unique identifiers to create a MachinePool's Name
           * (e.g. cluster's name, etc). In case the name is greater than the allowed maximum length,
           * the values are hashed together.
           */
          name: string;
          /**
           * nodeDeletionTimeout defines how long the controller will attempt to delete the Node that the MachinePool
           * hosts after the MachinePool is marked for deletion. A duration of 0 will retry deletion indefinitely.
           * Defaults to 10 seconds.
           */
          nodeDeletionTimeout?: string;
          /**
           * nodeDrainTimeout is the total amount of time that the controller will spend on draining a node.
           * The default value is 0, meaning that the node can be drained without any time limitations.
           * NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
           */
          nodeDrainTimeout?: string;
          /**
           * nodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes
           * to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
           */
          nodeVolumeDetachTimeout?: string;
          /**
           * replicas is the number of nodes belonging to this pool.
           * If the value is nil, the MachinePool is created without the number of Replicas (defaulting to 1)
           * and it's assumed that an external entity (like cluster autoscaler) is responsible for the management
           * of this value.
           */
          replicas?: number;
          /**
           * variables can be used to customize the MachinePool through patches.
           */
          variables?: {
            /**
             * overrides can be used to override Cluster level variables.
             */
            overrides?: {
              /**
               * definitionFrom specifies where the definition of this Variable is from.
               *
               * Deprecated: This field is deprecated, must not be set anymore and is going to be removed in the next apiVersion.
               */
              definitionFrom?: string;
              /**
               * name of the variable.
               */
              name: string;
              /**
               * value of the variable.
               * Note: the value will be validated against the schema of the corresponding ClusterClassVariable
               * from the ClusterClass.
               * Note: We have to use apiextensionsv1.JSON instead of a custom JSON type, because controller-tools has a
               * hard-coded schema for apiextensionsv1.JSON which cannot be produced by another type via controller-tools,
               * i.e. it is not possible to have no type field.
               * Ref: https://github.com/kubernetes-sigs/controller-tools/blob/d0e03a142d0ecdd5491593e941ee1d6b5d91dba6/pkg/crd/known_types.go#L106-L111
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
     * conditions defines current service state of the cluster.
     */
    conditions?: {
      /**
       * lastTransitionTime is the last time the condition transitioned from one status to another.
       * This should be when the underlying condition changed. If that is not known, then using the time when
       * the API field changed is acceptable.
       */
      lastTransitionTime: string;
      /**
       * message is a human readable message indicating details about the transition.
       * This field may be empty.
       */
      message?: string;
      /**
       * reason is the reason for the condition's last transition in CamelCase.
       * The specific API may choose whether or not this field is considered a guaranteed API.
       * This field may be empty.
       */
      reason?: string;
      /**
       * severity provides an explicit classification of Reason code, so the users or machines can immediately
       * understand the current situation and act accordingly.
       * The Severity field MUST be set only when Status=False.
       */
      severity?: string;
      /**
       * status of the condition, one of True, False, Unknown.
       */
      status: string;
      /**
       * type of condition in CamelCase or in foo.example.com/CamelCase.
       * Many .condition.type values are consistent across resources like Available, but because arbitrary conditions
       * can be useful (see .node.status.conditions), the ability to deconflict is important.
       */
      type: string;
    }[];
    /**
     * controlPlaneReady denotes if the control plane became ready during initial provisioning
     * to receive requests.
     * NOTE: this field is part of the Cluster API contract and it is used to orchestrate provisioning.
     * The value of this field is never updated after provisioning is completed. Please use conditions
     * to check the operational state of the control plane.
     */
    controlPlaneReady?: boolean;
    /**
     * failureDomains is a slice of failure domain objects synced from the infrastructure provider.
     */
    failureDomains?: {
      /**
       * FailureDomainSpec is the Schema for Cluster API failure domains.
       * It allows controllers to understand how many failure domains a cluster can optionally span across.
       */
      [k: string]: {
        /**
         * attributes is a free form map of attributes an infrastructure provider might use or require.
         */
        attributes?: {
          [k: string]: string;
        };
        /**
         * controlPlane determines if this failure domain is suitable for use by control plane machines.
         */
        controlPlane?: boolean;
      };
    };
    /**
     * failureMessage indicates that there is a fatal problem reconciling the
     * state, and will be set to a descriptive error message.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    failureMessage?: string;
    /**
     * failureReason indicates that there is a fatal problem reconciling the
     * state, and will be set to a token value suitable for
     * programmatic interpretation.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    failureReason?: string;
    /**
     * infrastructureReady is the state of the infrastructure provider.
     */
    infrastructureReady?: boolean;
    /**
     * observedGeneration is the latest generation observed by the controller.
     */
    observedGeneration?: number;
    /**
     * phase represents the current phase of cluster actuation.
     * E.g. Pending, Running, Terminating, Failed etc.
     */
    phase?: string;
    /**
     * v1beta2 groups all the fields that will be added or modified in Cluster's status with the V1Beta2 version.
     */
    v1beta2?: {
      /**
       * conditions represents the observations of a Cluster's current state.
       * Known condition types are Available, InfrastructureReady, ControlPlaneInitialized, ControlPlaneAvailable, WorkersAvailable, MachinesReady
       * MachinesUpToDate, RemoteConnectionProbe, ScalingUp, ScalingDown, Remediating, Deleting, Paused.
       * Additionally, a TopologyReconciled condition will be added in case the Cluster is referencing a ClusterClass / defining a managed Topology.
       *
       * @maxItems 32
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
       * controlPlane groups all the observations about Cluster's ControlPlane current state.
       */
      controlPlane?: {
        /**
         * availableReplicas is the total number of available control plane machines in this cluster. A machine is considered available when Machine's Available condition is true.
         */
        availableReplicas?: number;
        /**
         * desiredReplicas is the total number of desired control plane machines in this cluster.
         */
        desiredReplicas?: number;
        /**
         * readyReplicas is the total number of ready control plane machines in this cluster. A machine is considered ready when Machine's Ready condition is true.
         */
        readyReplicas?: number;
        /**
         * replicas is the total number of control plane machines in this cluster.
         * NOTE: replicas also includes machines still being provisioned or being deleted.
         */
        replicas?: number;
        /**
         * upToDateReplicas is the number of up-to-date control plane machines in this cluster. A machine is considered up-to-date when Machine's UpToDate condition is true.
         */
        upToDateReplicas?: number;
      };
      /**
       * workers groups all the observations about Cluster's Workers current state.
       */
      workers?: {
        /**
         * availableReplicas is the total number of available worker machines in this cluster. A machine is considered available when Machine's Available condition is true.
         */
        availableReplicas?: number;
        /**
         * desiredReplicas is the total number of desired worker machines in this cluster.
         */
        desiredReplicas?: number;
        /**
         * readyReplicas is the total number of ready worker machines in this cluster. A machine is considered ready when Machine's Ready condition is true.
         */
        readyReplicas?: number;
        /**
         * replicas is the total number of worker machines in this cluster.
         * NOTE: replicas also includes machines still being provisioned or being deleted.
         */
        replicas?: number;
        /**
         * upToDateReplicas is the number of up-to-date worker machines in this cluster. A machine is considered up-to-date when Machine's UpToDate condition is true.
         */
        upToDateReplicas?: number;
      };
    };
  };
}

/**
 * MachineDeployment is the Schema for the machinedeployments API.
 */
export interface IMachineDeployment {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1beta1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'MachineDeployment';
  metadata: metav1.IObjectMeta;
  /**
   * MachineDeploymentSpec defines the desired state of MachineDeployment.
   */
  spec?: {
    /**
     * clusterName is the name of the Cluster this object belongs to.
     */
    clusterName: string;
    /**
     * machineNamingStrategy allows changing the naming pattern used when creating Machines.
     * Note: InfraMachines & BootstrapConfigs will use the same name as the corresponding Machines.
     */
    machineNamingStrategy?: {
      /**
       * template defines the template to use for generating the names of the
       * Machine objects.
       * If not defined, it will fallback to `{{ .machineSet.name }}-{{ .random }}`.
       * If the generated name string exceeds 63 characters, it will be trimmed to
       * 58 characters and will
       * get concatenated with a random suffix of length 5.
       * Length of the template string must not exceed 256 characters.
       * The template allows the following variables `.cluster.name`,
       * `.machineSet.name` and `.random`.
       * The variable `.cluster.name` retrieves the name of the cluster object
       * that owns the Machines being created.
       * The variable `.machineSet.name` retrieves the name of the MachineSet
       * object that owns the Machines being created.
       * The variable `.random` is substituted with random alphanumeric string,
       * without vowels, of length 5. This variable is required part of the
       * template. If not provided, validation will fail.
       */
      template?: string;
    };
    /**
     * minReadySeconds is the minimum number of seconds for which a Node for a newly created machine should be ready before considering the replica available.
     * Defaults to 0 (machine will be considered available as soon as the Node is ready)
     */
    minReadySeconds?: number;
    /**
     * paused indicates that the deployment is paused.
     */
    paused?: boolean;
    /**
     * progressDeadlineSeconds is the maximum time in seconds for a deployment to make progress before it
     * is considered to be failed. The deployment controller will continue to
     * process failed deployments and a condition with a ProgressDeadlineExceeded
     * reason will be surfaced in the deployment status. Note that progress will
     * not be estimated during the time a deployment is paused. Defaults to 600s.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/issues/11470 for more details.
     */
    progressDeadlineSeconds?: number;
    /**
     * replicas is the number of desired machines.
     * This is a pointer to distinguish between explicit zero and not specified.
     *
     * Defaults to:
     * * if the Kubernetes autoscaler min size and max size annotations are set:
     *   - if it's a new MachineDeployment, use min size
     *   - if the replicas field of the old MachineDeployment is < min size, use min size
     *   - if the replicas field of the old MachineDeployment is > max size, use max size
     *   - if the replicas field of the old MachineDeployment is in the (min size, max size) range, keep the value from the oldMD
     * * otherwise use 1
     * Note: Defaulting will be run whenever the replicas field is not set:
     * * A new MachineDeployment is created with replicas not set.
     * * On an existing MachineDeployment the replicas field was first set and is now unset.
     * Those cases are especially relevant for the following Kubernetes autoscaler use cases:
     * * A new MachineDeployment is created and replicas should be managed by the autoscaler
     * * An existing MachineDeployment which initially wasn't controlled by the autoscaler
     *   should be later controlled by the autoscaler
     */
    replicas?: number;
    /**
     * revisionHistoryLimit is the number of old MachineSets to retain to allow rollback.
     * This is a pointer to distinguish between explicit zero and not specified.
     * Defaults to 1.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/issues/10479 for more details.
     */
    revisionHistoryLimit?: number;
    /**
     * rolloutAfter is a field to indicate a rollout should be performed
     * after the specified time even if no changes have been made to the
     * MachineDeployment.
     * Example: In the YAML the time can be specified in the RFC3339 format.
     * To specify the rolloutAfter target as March 9, 2023, at 9 am UTC
     * use "2023-03-09T09:00:00Z".
     */
    rolloutAfter?: string;
    /**
     * selector is the label selector for machines. Existing MachineSets whose machines are
     * selected by this will be the ones affected by this deployment.
     * It must match the machine template's labels.
     */
    selector: {
      /**
       * matchExpressions is a list of label selector requirements. The requirements are ANDed.
       */
      matchExpressions?: {
        /**
         * key is the label key that the selector applies to.
         */
        key: string;
        /**
         * operator represents a key's relationship to a set of values.
         * Valid operators are In, NotIn, Exists and DoesNotExist.
         */
        operator: string;
        /**
         * values is an array of string values. If the operator is In or NotIn,
         * the values array must be non-empty. If the operator is Exists or DoesNotExist,
         * the values array must be empty. This array is replaced during a strategic
         * merge patch.
         */
        values?: string[];
      }[];
      /**
       * matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels
       * map is equivalent to an element of matchExpressions, whose key field is "key", the
       * operator is "In", and the values array contains only "value". The requirements are ANDed.
       */
      matchLabels?: {
        [k: string]: string;
      };
    };
    /**
     * strategy is the deployment strategy to use to replace existing machines with
     * new ones.
     */
    strategy?: {
      /**
       * remediation controls the strategy of remediating unhealthy machines
       * and how remediating operations should occur during the lifecycle of the dependant MachineSets.
       */
      remediation?: {
        /**
         * maxInFlight determines how many in flight remediations should happen at the same time.
         *
         * Remediation only happens on the MachineSet with the most current revision, while
         * older MachineSets (usually present during rollout operations) aren't allowed to remediate.
         *
         * Note: In general (independent of remediations), unhealthy machines are always
         * prioritized during scale down operations over healthy ones.
         *
         * MaxInFlight can be set to a fixed number or a percentage.
         * Example: when this is set to 20%, the MachineSet controller deletes at most 20% of
         * the desired replicas.
         *
         * If not set, remediation is limited to all machines (bounded by replicas)
         * under the active MachineSet's management.
         */
        maxInFlight?: number | string;
      };
      /**
       * rollingUpdate is the rolling update config params. Present only if
       * MachineDeploymentStrategyType = RollingUpdate.
       */
      rollingUpdate?: {
        /**
         * deletePolicy defines the policy used by the MachineDeployment to identify nodes to delete when downscaling.
         * Valid values are "Random, "Newest", "Oldest"
         * When no value is supplied, the default DeletePolicy of MachineSet is used
         */
        deletePolicy?: 'Random' | 'Newest' | 'Oldest';
        /**
         * maxSurge is the maximum number of machines that can be scheduled above the
         * desired number of machines.
         * Value can be an absolute number (ex: 5) or a percentage of
         * desired machines (ex: 10%).
         * This can not be 0 if MaxUnavailable is 0.
         * Absolute number is calculated from percentage by rounding up.
         * Defaults to 1.
         * Example: when this is set to 30%, the new MachineSet can be scaled
         * up immediately when the rolling update starts, such that the total
         * number of old and new machines do not exceed 130% of desired
         * machines. Once old machines have been killed, new MachineSet can
         * be scaled up further, ensuring that total number of machines running
         * at any time during the update is at most 130% of desired machines.
         */
        maxSurge?: number | string;
        /**
         * maxUnavailable is the maximum number of machines that can be unavailable during the update.
         * Value can be an absolute number (ex: 5) or a percentage of desired
         * machines (ex: 10%).
         * Absolute number is calculated from percentage by rounding down.
         * This can not be 0 if MaxSurge is 0.
         * Defaults to 0.
         * Example: when this is set to 30%, the old MachineSet can be scaled
         * down to 70% of desired machines immediately when the rolling update
         * starts. Once new machines are ready, old MachineSet can be scaled
         * down further, followed by scaling up the new MachineSet, ensuring
         * that the total number of machines available at all times
         * during the update is at least 70% of desired machines.
         */
        maxUnavailable?: number | string;
      };
      /**
       * type of deployment. Allowed values are RollingUpdate and OnDelete.
       * The default is RollingUpdate.
       */
      type?: 'RollingUpdate' | 'OnDelete';
    };
    /**
     * template describes the machines that will be created.
     */
    template: {
      /**
       * Standard object's metadata.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata
       */
      metadata?: {
        /**
         * annotations is an unstructured key value map stored with a resource that may be
         * set by external tools to store and retrieve arbitrary metadata. They are not
         * queryable and should be preserved when modifying objects.
         * More info: http://kubernetes.io/docs/user-guide/annotations
         */
        annotations?: {
          [k: string]: string;
        };
        /**
         * labels is a map of string keys and values that can be used to organize and categorize
         * (scope and select) objects. May match selectors of replication controllers
         * and services.
         * More info: http://kubernetes.io/docs/user-guide/labels
         */
        labels?: {
          [k: string]: string;
        };
      };
      /**
       * spec is the specification of the desired behavior of the machine.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status
       */
      spec?: {
        /**
         * bootstrap is a reference to a local struct which encapsulates
         * fields to configure the Machine’s bootstrapping mechanism.
         */
        bootstrap: {
          /**
           * configRef is a reference to a bootstrap provider-specific resource
           * that holds configuration details. The reference is optional to
           * allow users/operators to specify Bootstrap.DataSecretName without
           * the need of a controller.
           */
          configRef?: {
            /**
             * API version of the referent.
             */
            apiVersion?: string;
            /**
             * If referring to a piece of an object instead of an entire object, this string
             * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
             * For example, if the object reference is to a container within a pod, this would take on a value like:
             * "spec.containers{name}" (where "name" refers to the name of the container that triggered
             * the event) or if no container name is specified "spec.containers[2]" (container with
             * index 2 in this pod). This syntax is chosen only to have some well-defined way of
             * referencing a part of an object.
             */
            fieldPath?: string;
            /**
             * Kind of the referent.
             * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
             */
            kind?: string;
            /**
             * Name of the referent.
             * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
             */
            name?: string;
            /**
             * Namespace of the referent.
             * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
             */
            namespace?: string;
            /**
             * Specific resourceVersion to which this reference is made, if any.
             * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
             */
            resourceVersion?: string;
            /**
             * UID of the referent.
             * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
             */
            uid?: string;
          };
          /**
           * dataSecretName is the name of the secret that stores the bootstrap data script.
           * If nil, the Machine should remain in the Pending state.
           */
          dataSecretName?: string;
        };
        /**
         * clusterName is the name of the Cluster this object belongs to.
         */
        clusterName: string;
        /**
         * failureDomain is the failure domain the machine will be created in.
         * Must match a key in the FailureDomains map stored on the cluster object.
         */
        failureDomain?: string;
        /**
         * infrastructureRef is a required reference to a custom resource
         * offered by an infrastructure provider.
         */
        infrastructureRef: {
          /**
           * API version of the referent.
           */
          apiVersion?: string;
          /**
           * If referring to a piece of an object instead of an entire object, this string
           * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
           * For example, if the object reference is to a container within a pod, this would take on a value like:
           * "spec.containers{name}" (where "name" refers to the name of the container that triggered
           * the event) or if no container name is specified "spec.containers[2]" (container with
           * index 2 in this pod). This syntax is chosen only to have some well-defined way of
           * referencing a part of an object.
           */
          fieldPath?: string;
          /**
           * Kind of the referent.
           * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
           */
          kind?: string;
          /**
           * Name of the referent.
           * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
           */
          name?: string;
          /**
           * Namespace of the referent.
           * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
           */
          namespace?: string;
          /**
           * Specific resourceVersion to which this reference is made, if any.
           * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
           */
          resourceVersion?: string;
          /**
           * UID of the referent.
           * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
           */
          uid?: string;
        };
        /**
         * nodeDeletionTimeout defines how long the controller will attempt to delete the Node that the Machine
         * hosts after the Machine is marked for deletion. A duration of 0 will retry deletion indefinitely.
         * Defaults to 10 seconds.
         */
        nodeDeletionTimeout?: string;
        /**
         * nodeDrainTimeout is the total amount of time that the controller will spend on draining a node.
         * The default value is 0, meaning that the node can be drained without any time limitations.
         * NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
         */
        nodeDrainTimeout?: string;
        /**
         * nodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes
         * to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
         */
        nodeVolumeDetachTimeout?: string;
        /**
         * providerID is the identification ID of the machine provided by the provider.
         * This field must match the provider ID as seen on the node object corresponding to this machine.
         * This field is required by higher level consumers of cluster-api. Example use case is cluster autoscaler
         * with cluster-api as provider. Clean-up logic in the autoscaler compares machines to nodes to find out
         * machines at provider which could not get registered as Kubernetes nodes. With cluster-api as a
         * generic out-of-tree provider for autoscaler, this field is required by autoscaler to be
         * able to have a provider view of the list of machines. Another list of nodes is queried from the k8s apiserver
         * and then a comparison is done to find out unregistered machines and are marked for delete.
         * This field will be set by the actuators and consumed by higher level entities like autoscaler that will
         * be interfacing with cluster-api as generic provider.
         */
        providerID?: string;
        /**
         * readinessGates specifies additional conditions to include when evaluating Machine Ready condition.
         *
         * This field can be used e.g. by Cluster API control plane providers to extend the semantic of the
         * Ready condition for the Machine they control, like the kubeadm control provider adding ReadinessGates
         * for the APIServerPodHealthy, SchedulerPodHealthy conditions, etc.
         *
         * Another example are external controllers, e.g. responsible to install special software/hardware on the Machines;
         * they can include the status of those components with a new condition and add this condition to ReadinessGates.
         *
         * NOTE: This field is considered only for computing v1beta2 conditions.
         * NOTE: In case readinessGates conditions start with the APIServer, ControllerManager, Scheduler prefix, and all those
         * readiness gates condition are reporting the same message, when computing the Machine's Ready condition those
         * readinessGates will be replaced by a single entry reporting "Control plane components: " + message.
         * This helps to improve readability of conditions bubbling up to the Machine's owner resource / to the Cluster).
         *
         * @maxItems 32
         */
        readinessGates?: {
          /**
           * conditionType refers to a positive polarity condition (status true means good) with matching type in the Machine's condition list.
           * If the conditions doesn't exist, it will be treated as unknown.
           * Note: Both Cluster API conditions or conditions added by 3rd party controllers can be used as readiness gates.
           */
          conditionType: string;
        }[];
        /**
         * version defines the desired Kubernetes version.
         * This field is meant to be optionally used by bootstrap providers.
         */
        version?: string;
      };
    };
  };
  /**
   * MachineDeploymentStatus defines the observed state of MachineDeployment.
   */
  status?: {
    /**
     * availableReplicas is the total number of available machines (ready for at least minReadySeconds)
     * targeted by this deployment.
     */
    availableReplicas?: number;
    /**
     * conditions defines current service state of the MachineDeployment.
     */
    conditions?: {
      /**
       * lastTransitionTime is the last time the condition transitioned from one status to another.
       * This should be when the underlying condition changed. If that is not known, then using the time when
       * the API field changed is acceptable.
       */
      lastTransitionTime: string;
      /**
       * message is a human readable message indicating details about the transition.
       * This field may be empty.
       */
      message?: string;
      /**
       * reason is the reason for the condition's last transition in CamelCase.
       * The specific API may choose whether or not this field is considered a guaranteed API.
       * This field may be empty.
       */
      reason?: string;
      /**
       * severity provides an explicit classification of Reason code, so the users or machines can immediately
       * understand the current situation and act accordingly.
       * The Severity field MUST be set only when Status=False.
       */
      severity?: string;
      /**
       * status of the condition, one of True, False, Unknown.
       */
      status: string;
      /**
       * type of condition in CamelCase or in foo.example.com/CamelCase.
       * Many .condition.type values are consistent across resources like Available, but because arbitrary conditions
       * can be useful (see .node.status.conditions), the ability to deconflict is important.
       */
      type: string;
    }[];
    /**
     * observedGeneration is the generation observed by the deployment controller.
     */
    observedGeneration?: number;
    /**
     * phase represents the current phase of a MachineDeployment (ScalingUp, ScalingDown, Running, Failed, or Unknown).
     */
    phase?: string;
    /**
     * readyReplicas is the total number of ready machines targeted by this deployment.
     */
    readyReplicas?: number;
    /**
     * replicas is the total number of non-terminated machines targeted by this deployment
     * (their labels match the selector).
     */
    replicas?: number;
    /**
     * selector is the same as the label selector but in the string format to avoid introspection
     * by clients. The string will be in the same format as the query-param syntax.
     * More info about label selectors: http://kubernetes.io/docs/user-guide/labels#label-selectors
     */
    selector?: string;
    /**
     * unavailableReplicas is the total number of unavailable machines targeted by this deployment.
     * This is the total number of machines that are still required for
     * the deployment to have 100% available capacity. They may either
     * be machines that are running but not yet available or machines
     * that still have not been created.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    unavailableReplicas?: number;
    /**
     * updatedReplicas is the total number of non-terminated machines targeted by this deployment
     * that have the desired template spec.
     */
    updatedReplicas?: number;
    /**
     * v1beta2 groups all the fields that will be added or modified in MachineDeployment's status with the V1Beta2 version.
     */
    v1beta2?: {
      /**
       * availableReplicas is the number of available replicas for this MachineDeployment. A machine is considered available when Machine's Available condition is true.
       */
      availableReplicas?: number;
      /**
       * conditions represents the observations of a MachineDeployment's current state.
       * Known condition types are Available, MachinesReady, MachinesUpToDate, ScalingUp, ScalingDown, Remediating, Deleting, Paused.
       *
       * @maxItems 32
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
       * readyReplicas is the number of ready replicas for this MachineDeployment. A machine is considered ready when Machine's Ready condition is true.
       */
      readyReplicas?: number;
      /**
       * upToDateReplicas is the number of up-to-date replicas targeted by this deployment. A machine is considered up-to-date when Machine's UpToDate condition is true.
       */
      upToDateReplicas?: number;
    };
  };
}

/**
 * Machine is the Schema for the machines API.
 */
export interface IMachine {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1beta1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'Machine';
  metadata: metav1.IObjectMeta;
  /**
   * MachineSpec defines the desired state of Machine.
   */
  spec?: {
    /**
     * bootstrap is a reference to a local struct which encapsulates
     * fields to configure the Machine’s bootstrapping mechanism.
     */
    bootstrap: {
      /**
       * configRef is a reference to a bootstrap provider-specific resource
       * that holds configuration details. The reference is optional to
       * allow users/operators to specify Bootstrap.DataSecretName without
       * the need of a controller.
       */
      configRef?: {
        /**
         * API version of the referent.
         */
        apiVersion?: string;
        /**
         * If referring to a piece of an object instead of an entire object, this string
         * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
         * For example, if the object reference is to a container within a pod, this would take on a value like:
         * "spec.containers{name}" (where "name" refers to the name of the container that triggered
         * the event) or if no container name is specified "spec.containers[2]" (container with
         * index 2 in this pod). This syntax is chosen only to have some well-defined way of
         * referencing a part of an object.
         */
        fieldPath?: string;
        /**
         * Kind of the referent.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
         */
        kind?: string;
        /**
         * Name of the referent.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
         */
        name?: string;
        /**
         * Namespace of the referent.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
         */
        namespace?: string;
        /**
         * Specific resourceVersion to which this reference is made, if any.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
         */
        resourceVersion?: string;
        /**
         * UID of the referent.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
         */
        uid?: string;
      };
      /**
       * dataSecretName is the name of the secret that stores the bootstrap data script.
       * If nil, the Machine should remain in the Pending state.
       */
      dataSecretName?: string;
    };
    /**
     * clusterName is the name of the Cluster this object belongs to.
     */
    clusterName: string;
    /**
     * failureDomain is the failure domain the machine will be created in.
     * Must match a key in the FailureDomains map stored on the cluster object.
     */
    failureDomain?: string;
    /**
     * infrastructureRef is a required reference to a custom resource
     * offered by an infrastructure provider.
     */
    infrastructureRef: {
      /**
       * API version of the referent.
       */
      apiVersion?: string;
      /**
       * If referring to a piece of an object instead of an entire object, this string
       * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
       * For example, if the object reference is to a container within a pod, this would take on a value like:
       * "spec.containers{name}" (where "name" refers to the name of the container that triggered
       * the event) or if no container name is specified "spec.containers[2]" (container with
       * index 2 in this pod). This syntax is chosen only to have some well-defined way of
       * referencing a part of an object.
       */
      fieldPath?: string;
      /**
       * Kind of the referent.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
       */
      kind?: string;
      /**
       * Name of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
       */
      name?: string;
      /**
       * Namespace of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
       */
      namespace?: string;
      /**
       * Specific resourceVersion to which this reference is made, if any.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
       */
      resourceVersion?: string;
      /**
       * UID of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
       */
      uid?: string;
    };
    /**
     * nodeDeletionTimeout defines how long the controller will attempt to delete the Node that the Machine
     * hosts after the Machine is marked for deletion. A duration of 0 will retry deletion indefinitely.
     * Defaults to 10 seconds.
     */
    nodeDeletionTimeout?: string;
    /**
     * nodeDrainTimeout is the total amount of time that the controller will spend on draining a node.
     * The default value is 0, meaning that the node can be drained without any time limitations.
     * NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
     */
    nodeDrainTimeout?: string;
    /**
     * nodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes
     * to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
     */
    nodeVolumeDetachTimeout?: string;
    /**
     * providerID is the identification ID of the machine provided by the provider.
     * This field must match the provider ID as seen on the node object corresponding to this machine.
     * This field is required by higher level consumers of cluster-api. Example use case is cluster autoscaler
     * with cluster-api as provider. Clean-up logic in the autoscaler compares machines to nodes to find out
     * machines at provider which could not get registered as Kubernetes nodes. With cluster-api as a
     * generic out-of-tree provider for autoscaler, this field is required by autoscaler to be
     * able to have a provider view of the list of machines. Another list of nodes is queried from the k8s apiserver
     * and then a comparison is done to find out unregistered machines and are marked for delete.
     * This field will be set by the actuators and consumed by higher level entities like autoscaler that will
     * be interfacing with cluster-api as generic provider.
     */
    providerID?: string;
    /**
     * readinessGates specifies additional conditions to include when evaluating Machine Ready condition.
     *
     * This field can be used e.g. by Cluster API control plane providers to extend the semantic of the
     * Ready condition for the Machine they control, like the kubeadm control provider adding ReadinessGates
     * for the APIServerPodHealthy, SchedulerPodHealthy conditions, etc.
     *
     * Another example are external controllers, e.g. responsible to install special software/hardware on the Machines;
     * they can include the status of those components with a new condition and add this condition to ReadinessGates.
     *
     * NOTE: This field is considered only for computing v1beta2 conditions.
     * NOTE: In case readinessGates conditions start with the APIServer, ControllerManager, Scheduler prefix, and all those
     * readiness gates condition are reporting the same message, when computing the Machine's Ready condition those
     * readinessGates will be replaced by a single entry reporting "Control plane components: " + message.
     * This helps to improve readability of conditions bubbling up to the Machine's owner resource / to the Cluster).
     *
     * @maxItems 32
     */
    readinessGates?: {
      /**
       * conditionType refers to a positive polarity condition (status true means good) with matching type in the Machine's condition list.
       * If the conditions doesn't exist, it will be treated as unknown.
       * Note: Both Cluster API conditions or conditions added by 3rd party controllers can be used as readiness gates.
       */
      conditionType: string;
    }[];
    /**
     * version defines the desired Kubernetes version.
     * This field is meant to be optionally used by bootstrap providers.
     */
    version?: string;
  };
  /**
   * MachineStatus defines the observed state of Machine.
   */
  status?: {
    /**
     * addresses is a list of addresses assigned to the machine.
     * This field is copied from the infrastructure provider reference.
     */
    addresses?: {
      /**
       * address is the machine address.
       */
      address: string;
      /**
       * type is the machine address type, one of Hostname, ExternalIP, InternalIP, ExternalDNS or InternalDNS.
       */
      type: string;
    }[];
    /**
     * bootstrapReady is the state of the bootstrap provider.
     */
    bootstrapReady?: boolean;
    /**
     * certificatesExpiryDate is the expiry date of the machine certificates.
     * This value is only set for control plane machines.
     */
    certificatesExpiryDate?: string;
    /**
     * conditions defines current service state of the Machine.
     */
    conditions?: {
      /**
       * lastTransitionTime is the last time the condition transitioned from one status to another.
       * This should be when the underlying condition changed. If that is not known, then using the time when
       * the API field changed is acceptable.
       */
      lastTransitionTime: string;
      /**
       * message is a human readable message indicating details about the transition.
       * This field may be empty.
       */
      message?: string;
      /**
       * reason is the reason for the condition's last transition in CamelCase.
       * The specific API may choose whether or not this field is considered a guaranteed API.
       * This field may be empty.
       */
      reason?: string;
      /**
       * severity provides an explicit classification of Reason code, so the users or machines can immediately
       * understand the current situation and act accordingly.
       * The Severity field MUST be set only when Status=False.
       */
      severity?: string;
      /**
       * status of the condition, one of True, False, Unknown.
       */
      status: string;
      /**
       * type of condition in CamelCase or in foo.example.com/CamelCase.
       * Many .condition.type values are consistent across resources like Available, but because arbitrary conditions
       * can be useful (see .node.status.conditions), the ability to deconflict is important.
       */
      type: string;
    }[];
    /**
     * deletion contains information relating to removal of the Machine.
     * Only present when the Machine has a deletionTimestamp and drain or wait for volume detach started.
     */
    deletion?: {
      /**
       * nodeDrainStartTime is the time when the drain of the node started and is used to determine
       * if the NodeDrainTimeout is exceeded.
       * Only present when the Machine has a deletionTimestamp and draining the node had been started.
       */
      nodeDrainStartTime?: string;
      /**
       * waitForNodeVolumeDetachStartTime is the time when waiting for volume detachment started
       * and is used to determine if the NodeVolumeDetachTimeout is exceeded.
       * Detaching volumes from nodes is usually done by CSI implementations and the current state
       * is observed from the node's `.Status.VolumesAttached` field.
       * Only present when the Machine has a deletionTimestamp and waiting for volume detachments had been started.
       */
      waitForNodeVolumeDetachStartTime?: string;
    };
    /**
     * failureMessage will be set in the event that there is a terminal problem
     * reconciling the Machine and will contain a more verbose string suitable
     * for logging and human consumption.
     *
     * This field should not be set for transitive errors that a controller
     * faces that are expected to be fixed automatically over
     * time (like service outages), but instead indicate that something is
     * fundamentally wrong with the Machine's spec or the configuration of
     * the controller, and that manual intervention is required. Examples
     * of terminal errors would be invalid combinations of settings in the
     * spec, values that are unsupported by the controller, or the
     * responsible controller itself being critically misconfigured.
     *
     * Any transient errors that occur during the reconciliation of Machines
     * can be added as events to the Machine object and/or logged in the
     * controller's output.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    failureMessage?: string;
    /**
     * failureReason will be set in the event that there is a terminal problem
     * reconciling the Machine and will contain a succinct value suitable
     * for machine interpretation.
     *
     * This field should not be set for transitive errors that a controller
     * faces that are expected to be fixed automatically over
     * time (like service outages), but instead indicate that something is
     * fundamentally wrong with the Machine's spec or the configuration of
     * the controller, and that manual intervention is required. Examples
     * of terminal errors would be invalid combinations of settings in the
     * spec, values that are unsupported by the controller, or the
     * responsible controller itself being critically misconfigured.
     *
     * Any transient errors that occur during the reconciliation of Machines
     * can be added as events to the Machine object and/or logged in the
     * controller's output.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    failureReason?: string;
    /**
     * infrastructureReady is the state of the infrastructure provider.
     */
    infrastructureReady?: boolean;
    /**
     * lastUpdated identifies when the phase of the Machine last transitioned.
     */
    lastUpdated?: string;
    /**
     * nodeInfo is a set of ids/uuids to uniquely identify the node.
     * More info: https://kubernetes.io/docs/concepts/nodes/node/#info
     */
    nodeInfo?: {
      /**
       * The Architecture reported by the node
       */
      architecture: string;
      /**
       * Boot ID reported by the node.
       */
      bootID: string;
      /**
       * ContainerRuntime Version reported by the node through runtime remote API (e.g. containerd://1.4.2).
       */
      containerRuntimeVersion: string;
      /**
       * Kernel Version reported by the node from 'uname -r' (e.g. 3.16.0-0.bpo.4-amd64).
       */
      kernelVersion: string;
      /**
       * Deprecated: KubeProxy Version reported by the node.
       */
      kubeProxyVersion: string;
      /**
       * Kubelet Version reported by the node.
       */
      kubeletVersion: string;
      /**
       * MachineID reported by the node. For unique machine identification
       * in the cluster this field is preferred. Learn more from man(5)
       * machine-id: http://man7.org/linux/man-pages/man5/machine-id.5.html
       */
      machineID: string;
      /**
       * The Operating System reported by the node
       */
      operatingSystem: string;
      /**
       * OS Image reported by the node from /etc/os-release (e.g. Debian GNU/Linux 7 (wheezy)).
       */
      osImage: string;
      /**
       * SystemUUID reported by the node. For unique machine identification
       * MachineID is preferred. This field is specific to Red Hat hosts
       * https://access.redhat.com/documentation/en-us/red_hat_subscription_management/1/html/rhsm/uuid
       */
      systemUUID: string;
    };
    /**
     * nodeRef will point to the corresponding Node if it exists.
     */
    nodeRef?: {
      /**
       * API version of the referent.
       */
      apiVersion?: string;
      /**
       * If referring to a piece of an object instead of an entire object, this string
       * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
       * For example, if the object reference is to a container within a pod, this would take on a value like:
       * "spec.containers{name}" (where "name" refers to the name of the container that triggered
       * the event) or if no container name is specified "spec.containers[2]" (container with
       * index 2 in this pod). This syntax is chosen only to have some well-defined way of
       * referencing a part of an object.
       */
      fieldPath?: string;
      /**
       * Kind of the referent.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
       */
      kind?: string;
      /**
       * Name of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
       */
      name?: string;
      /**
       * Namespace of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
       */
      namespace?: string;
      /**
       * Specific resourceVersion to which this reference is made, if any.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
       */
      resourceVersion?: string;
      /**
       * UID of the referent.
       * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
       */
      uid?: string;
    };
    /**
     * observedGeneration is the latest generation observed by the controller.
     */
    observedGeneration?: number;
    /**
     * phase represents the current phase of machine actuation.
     * E.g. Pending, Running, Terminating, Failed etc.
     */
    phase?: string;
    /**
     * v1beta2 groups all the fields that will be added or modified in Machine's status with the V1Beta2 version.
     */
    v1beta2?: {
      /**
       * conditions represents the observations of a Machine's current state.
       * Known condition types are Available, Ready, UpToDate, BootstrapConfigReady, InfrastructureReady, NodeReady,
       * NodeHealthy, Deleting, Paused.
       * If a MachineHealthCheck is targeting this machine, also HealthCheckSucceeded, OwnerRemediated conditions are added.
       * Additionally control plane Machines controlled by KubeadmControlPlane will have following additional conditions:
       * APIServerPodHealthy, ControllerManagerPodHealthy, SchedulerPodHealthy, EtcdPodHealthy, EtcdMemberHealthy.
       *
       * @maxItems 32
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
    };
  };
}

/**
 * KubeadmControlPlane is the Schema for the KubeadmControlPlane API.
 */
export interface IKubeadmControlPlane {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1beta1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'KubeadmControlPlane';
  metadata: metav1.IObjectMeta;
  /**
   * KubeadmControlPlaneSpec defines the desired state of KubeadmControlPlane.
   */
  spec?: {
    /**
     * kubeadmConfigSpec is a KubeadmConfigSpec
     * to use for initializing and joining machines to the control plane.
     */
    kubeadmConfigSpec: {
      /**
       * clusterConfiguration along with InitConfiguration are the configurations necessary for the init command
       */
      clusterConfiguration?: {
        /**
         * apiServer contains extra settings for the API server control plane component
         */
        apiServer?: {
          /**
           * certSANs sets extra Subject Alternative Names for the API Server signing cert.
           */
          certSANs?: string[];
          /**
           * extraArgs is an extra set of flags to pass to the control plane component.
           */
          extraArgs?: {
            [k: string]: string;
          };
          /**
           * extraEnvs is an extra set of environment variables to pass to the control plane component.
           * Environment variables passed using ExtraEnvs will override any existing environment variables, or *_proxy environment variables that kubeadm adds by default.
           * This option takes effect only on Kubernetes >=1.31.0.
           */
          extraEnvs?: {
            /**
             * Name of the environment variable. Must be a C_IDENTIFIER.
             */
            name: string;
            /**
             * Variable references $(VAR_NAME) are expanded
             * using the previously defined environment variables in the container and
             * any service environment variables. If a variable cannot be resolved,
             * the reference in the input string will be unchanged. Double $$ are reduced
             * to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e.
             * "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
             * Escaped references will never be expanded, regardless of whether the variable
             * exists or not.
             * Defaults to "".
             */
            value?: string;
            /**
             * Source for the environment variable's value. Cannot be used if value is not empty.
             */
            valueFrom?: {
              /**
               * Selects a key of a ConfigMap.
               */
              configMapKeyRef?: {
                /**
                 * The key to select.
                 */
                key: string;
                /**
                 * Name of the referent.
                 * This field is effectively required, but due to backwards compatibility is
                 * allowed to be empty. Instances of this type with an empty value here are
                 * almost certainly wrong.
                 * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                 */
                name?: string;
                /**
                 * Specify whether the ConfigMap or its key must be defined
                 */
                optional?: boolean;
              };
              /**
               * Selects a field of the pod: supports metadata.name, metadata.namespace, `metadata.labels['<KEY>']`, `metadata.annotations['<KEY>']`,
               * spec.nodeName, spec.serviceAccountName, status.hostIP, status.podIP, status.podIPs.
               */
              fieldRef?: {
                /**
                 * Version of the schema the FieldPath is written in terms of, defaults to "v1".
                 */
                apiVersion?: string;
                /**
                 * Path of the field to select in the specified API version.
                 */
                fieldPath: string;
              };
              /**
               * Selects a resource of the container: only resources limits and requests
               * (limits.cpu, limits.memory, limits.ephemeral-storage, requests.cpu, requests.memory and requests.ephemeral-storage) are currently supported.
               */
              resourceFieldRef?: {
                /**
                 * Container name: required for volumes, optional for env vars
                 */
                containerName?: string;
                /**
                 * Specifies the output format of the exposed resources, defaults to "1"
                 */
                divisor?: number | string;
                /**
                 * Required: resource to select
                 */
                resource: string;
              };
              /**
               * Selects a key of a secret in the pod's namespace
               */
              secretKeyRef?: {
                /**
                 * The key of the secret to select from.  Must be a valid secret key.
                 */
                key: string;
                /**
                 * Name of the referent.
                 * This field is effectively required, but due to backwards compatibility is
                 * allowed to be empty. Instances of this type with an empty value here are
                 * almost certainly wrong.
                 * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                 */
                name?: string;
                /**
                 * Specify whether the Secret or its key must be defined
                 */
                optional?: boolean;
              };
            };
          }[];
          /**
           * extraVolumes is an extra set of host volumes, mounted to the control plane component.
           */
          extraVolumes?: {
            /**
             * hostPath is the path in the host that will be mounted inside
             * the pod.
             */
            hostPath: string;
            /**
             * mountPath is the path inside the pod where hostPath will be mounted.
             */
            mountPath: string;
            /**
             * name of the volume inside the pod template.
             */
            name: string;
            /**
             * pathType is the type of the HostPath.
             */
            pathType?: string;
            /**
             * readOnly controls write access to the volume
             */
            readOnly?: boolean;
          }[];
          /**
           * timeoutForControlPlane controls the timeout that we use for API server to appear
           */
          timeoutForControlPlane?: string;
        };
        /**
         * APIVersion defines the versioned schema of this representation of an object.
         * Servers should convert recognized schemas to the latest internal value, and
         * may reject unrecognized values.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
         */
        apiVersion?: string;
        /**
         * certificatesDir specifies where to store or look for all required certificates.
         * NB: if not provided, this will default to `/etc/kubernetes/pki`
         */
        certificatesDir?: string;
        /**
         * clusterName is the cluster name
         */
        clusterName?: string;
        /**
         * controlPlaneEndpoint sets a stable IP address or DNS name for the control plane; it
         * can be a valid IP address or a RFC-1123 DNS subdomain, both with optional TCP port.
         * In case the ControlPlaneEndpoint is not specified, the AdvertiseAddress + BindPort
         * are used; in case the ControlPlaneEndpoint is specified but without a TCP port,
         * the BindPort is used.
         * Possible usages are:
         * e.g. In a cluster with more than one control plane instances, this field should be
         * assigned the address of the external load balancer in front of the
         * control plane instances.
         * e.g.  in environments with enforced node recycling, the ControlPlaneEndpoint
         * could be used for assigning a stable DNS to the control plane.
         * NB: This value defaults to the first value in the Cluster object status.apiEndpoints array.
         */
        controlPlaneEndpoint?: string;
        /**
         * controllerManager contains extra settings for the controller manager control plane component
         */
        controllerManager?: {
          /**
           * extraArgs is an extra set of flags to pass to the control plane component.
           */
          extraArgs?: {
            [k: string]: string;
          };
          /**
           * extraEnvs is an extra set of environment variables to pass to the control plane component.
           * Environment variables passed using ExtraEnvs will override any existing environment variables, or *_proxy environment variables that kubeadm adds by default.
           * This option takes effect only on Kubernetes >=1.31.0.
           */
          extraEnvs?: {
            /**
             * Name of the environment variable. Must be a C_IDENTIFIER.
             */
            name: string;
            /**
             * Variable references $(VAR_NAME) are expanded
             * using the previously defined environment variables in the container and
             * any service environment variables. If a variable cannot be resolved,
             * the reference in the input string will be unchanged. Double $$ are reduced
             * to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e.
             * "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
             * Escaped references will never be expanded, regardless of whether the variable
             * exists or not.
             * Defaults to "".
             */
            value?: string;
            /**
             * Source for the environment variable's value. Cannot be used if value is not empty.
             */
            valueFrom?: {
              /**
               * Selects a key of a ConfigMap.
               */
              configMapKeyRef?: {
                /**
                 * The key to select.
                 */
                key: string;
                /**
                 * Name of the referent.
                 * This field is effectively required, but due to backwards compatibility is
                 * allowed to be empty. Instances of this type with an empty value here are
                 * almost certainly wrong.
                 * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                 */
                name?: string;
                /**
                 * Specify whether the ConfigMap or its key must be defined
                 */
                optional?: boolean;
              };
              /**
               * Selects a field of the pod: supports metadata.name, metadata.namespace, `metadata.labels['<KEY>']`, `metadata.annotations['<KEY>']`,
               * spec.nodeName, spec.serviceAccountName, status.hostIP, status.podIP, status.podIPs.
               */
              fieldRef?: {
                /**
                 * Version of the schema the FieldPath is written in terms of, defaults to "v1".
                 */
                apiVersion?: string;
                /**
                 * Path of the field to select in the specified API version.
                 */
                fieldPath: string;
              };
              /**
               * Selects a resource of the container: only resources limits and requests
               * (limits.cpu, limits.memory, limits.ephemeral-storage, requests.cpu, requests.memory and requests.ephemeral-storage) are currently supported.
               */
              resourceFieldRef?: {
                /**
                 * Container name: required for volumes, optional for env vars
                 */
                containerName?: string;
                /**
                 * Specifies the output format of the exposed resources, defaults to "1"
                 */
                divisor?: number | string;
                /**
                 * Required: resource to select
                 */
                resource: string;
              };
              /**
               * Selects a key of a secret in the pod's namespace
               */
              secretKeyRef?: {
                /**
                 * The key of the secret to select from.  Must be a valid secret key.
                 */
                key: string;
                /**
                 * Name of the referent.
                 * This field is effectively required, but due to backwards compatibility is
                 * allowed to be empty. Instances of this type with an empty value here are
                 * almost certainly wrong.
                 * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                 */
                name?: string;
                /**
                 * Specify whether the Secret or its key must be defined
                 */
                optional?: boolean;
              };
            };
          }[];
          /**
           * extraVolumes is an extra set of host volumes, mounted to the control plane component.
           */
          extraVolumes?: {
            /**
             * hostPath is the path in the host that will be mounted inside
             * the pod.
             */
            hostPath: string;
            /**
             * mountPath is the path inside the pod where hostPath will be mounted.
             */
            mountPath: string;
            /**
             * name of the volume inside the pod template.
             */
            name: string;
            /**
             * pathType is the type of the HostPath.
             */
            pathType?: string;
            /**
             * readOnly controls write access to the volume
             */
            readOnly?: boolean;
          }[];
        };
        /**
         * dns defines the options for the DNS add-on installed in the cluster.
         */
        dns?: {
          /**
           * imageRepository sets the container registry to pull images from.
           * if not set, the ImageRepository defined in ClusterConfiguration will be used instead.
           */
          imageRepository?: string;
          /**
           * imageTag allows to specify a tag for the image.
           * In case this value is set, kubeadm does not change automatically the version of the above components during upgrades.
           */
          imageTag?: string;
        };
        /**
         * etcd holds configuration for etcd.
         * NB: This value defaults to a Local (stacked) etcd
         */
        etcd?: {
          /**
           * external describes how to connect to an external etcd cluster
           * Local and External are mutually exclusive
           */
          external?: {
            /**
             * caFile is an SSL Certificate Authority file used to secure etcd communication.
             * Required if using a TLS connection.
             */
            caFile: string;
            /**
             * certFile is an SSL certification file used to secure etcd communication.
             * Required if using a TLS connection.
             */
            certFile: string;
            /**
             * endpoints of etcd members. Required for ExternalEtcd.
             */
            endpoints: string[];
            /**
             * keyFile is an SSL key file used to secure etcd communication.
             * Required if using a TLS connection.
             */
            keyFile: string;
          };
          /**
           * local provides configuration knobs for configuring the local etcd instance
           * Local and External are mutually exclusive
           */
          local?: {
            /**
             * dataDir is the directory etcd will place its data.
             * Defaults to "/var/lib/etcd".
             */
            dataDir?: string;
            /**
             * extraArgs are extra arguments provided to the etcd binary
             * when run inside a static pod.
             */
            extraArgs?: {
              [k: string]: string;
            };
            /**
             * extraEnvs is an extra set of environment variables to pass to the control plane component.
             * Environment variables passed using ExtraEnvs will override any existing environment variables, or *_proxy environment variables that kubeadm adds by default.
             * This option takes effect only on Kubernetes >=1.31.0.
             */
            extraEnvs?: {
              /**
               * Name of the environment variable. Must be a C_IDENTIFIER.
               */
              name: string;
              /**
               * Variable references $(VAR_NAME) are expanded
               * using the previously defined environment variables in the container and
               * any service environment variables. If a variable cannot be resolved,
               * the reference in the input string will be unchanged. Double $$ are reduced
               * to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e.
               * "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
               * Escaped references will never be expanded, regardless of whether the variable
               * exists or not.
               * Defaults to "".
               */
              value?: string;
              /**
               * Source for the environment variable's value. Cannot be used if value is not empty.
               */
              valueFrom?: {
                /**
                 * Selects a key of a ConfigMap.
                 */
                configMapKeyRef?: {
                  /**
                   * The key to select.
                   */
                  key: string;
                  /**
                   * Name of the referent.
                   * This field is effectively required, but due to backwards compatibility is
                   * allowed to be empty. Instances of this type with an empty value here are
                   * almost certainly wrong.
                   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                   */
                  name?: string;
                  /**
                   * Specify whether the ConfigMap or its key must be defined
                   */
                  optional?: boolean;
                };
                /**
                 * Selects a field of the pod: supports metadata.name, metadata.namespace, `metadata.labels['<KEY>']`, `metadata.annotations['<KEY>']`,
                 * spec.nodeName, spec.serviceAccountName, status.hostIP, status.podIP, status.podIPs.
                 */
                fieldRef?: {
                  /**
                   * Version of the schema the FieldPath is written in terms of, defaults to "v1".
                   */
                  apiVersion?: string;
                  /**
                   * Path of the field to select in the specified API version.
                   */
                  fieldPath: string;
                };
                /**
                 * Selects a resource of the container: only resources limits and requests
                 * (limits.cpu, limits.memory, limits.ephemeral-storage, requests.cpu, requests.memory and requests.ephemeral-storage) are currently supported.
                 */
                resourceFieldRef?: {
                  /**
                   * Container name: required for volumes, optional for env vars
                   */
                  containerName?: string;
                  /**
                   * Specifies the output format of the exposed resources, defaults to "1"
                   */
                  divisor?: number | string;
                  /**
                   * Required: resource to select
                   */
                  resource: string;
                };
                /**
                 * Selects a key of a secret in the pod's namespace
                 */
                secretKeyRef?: {
                  /**
                   * The key of the secret to select from.  Must be a valid secret key.
                   */
                  key: string;
                  /**
                   * Name of the referent.
                   * This field is effectively required, but due to backwards compatibility is
                   * allowed to be empty. Instances of this type with an empty value here are
                   * almost certainly wrong.
                   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                   */
                  name?: string;
                  /**
                   * Specify whether the Secret or its key must be defined
                   */
                  optional?: boolean;
                };
              };
            }[];
            /**
             * imageRepository sets the container registry to pull images from.
             * if not set, the ImageRepository defined in ClusterConfiguration will be used instead.
             */
            imageRepository?: string;
            /**
             * imageTag allows to specify a tag for the image.
             * In case this value is set, kubeadm does not change automatically the version of the above components during upgrades.
             */
            imageTag?: string;
            /**
             * peerCertSANs sets extra Subject Alternative Names for the etcd peer signing cert.
             */
            peerCertSANs?: string[];
            /**
             * serverCertSANs sets extra Subject Alternative Names for the etcd server signing cert.
             */
            serverCertSANs?: string[];
          };
        };
        /**
         * featureGates enabled by the user.
         */
        featureGates?: {
          [k: string]: boolean;
        };
        /**
         * imageRepository sets the container registry to pull images from.
         * * If not set, the default registry of kubeadm will be used, i.e.
         *   * registry.k8s.io (new registry): >= v1.22.17, >= v1.23.15, >= v1.24.9, >= v1.25.0
         *   * k8s.gcr.io (old registry): all older versions
         *   Please note that when imageRepository is not set we don't allow upgrades to
         *   versions >= v1.22.0 which use the old registry (k8s.gcr.io). Please use
         *   a newer patch version with the new registry instead (i.e. >= v1.22.17,
         *   >= v1.23.15, >= v1.24.9, >= v1.25.0).
         * * If the version is a CI build (kubernetes version starts with `ci/` or `ci-cross/`)
         *  `gcr.io/k8s-staging-ci-images` will be used as a default for control plane components
         *   and for kube-proxy, while `registry.k8s.io` will be used for all the other images.
         */
        imageRepository?: string;
        /**
         * Kind is a string value representing the REST resource this object represents.
         * Servers may infer this from the endpoint the client submits requests to.
         * Cannot be updated.
         * In CamelCase.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
         */
        kind?: string;
        /**
         * kubernetesVersion is the target version of the control plane.
         * NB: This value defaults to the Machine object spec.version
         */
        kubernetesVersion?: string;
        /**
         * networking holds configuration for the networking topology of the cluster.
         * NB: This value defaults to the Cluster object spec.clusterNetwork.
         */
        networking?: {
          /**
           * dnsDomain is the dns domain used by k8s services. Defaults to "cluster.local".
           */
          dnsDomain?: string;
          /**
           * podSubnet is the subnet used by pods.
           * If unset, the API server will not allocate CIDR ranges for every node.
           * Defaults to a comma-delimited string of the Cluster object's spec.clusterNetwork.services.cidrBlocks if that is set
           */
          podSubnet?: string;
          /**
           * serviceSubnet is the subnet used by k8s services.
           * Defaults to a comma-delimited string of the Cluster object's spec.clusterNetwork.pods.cidrBlocks, or
           * to "10.96.0.0/12" if that's unset.
           */
          serviceSubnet?: string;
        };
        /**
         * scheduler contains extra settings for the scheduler control plane component
         */
        scheduler?: {
          /**
           * extraArgs is an extra set of flags to pass to the control plane component.
           */
          extraArgs?: {
            [k: string]: string;
          };
          /**
           * extraEnvs is an extra set of environment variables to pass to the control plane component.
           * Environment variables passed using ExtraEnvs will override any existing environment variables, or *_proxy environment variables that kubeadm adds by default.
           * This option takes effect only on Kubernetes >=1.31.0.
           */
          extraEnvs?: {
            /**
             * Name of the environment variable. Must be a C_IDENTIFIER.
             */
            name: string;
            /**
             * Variable references $(VAR_NAME) are expanded
             * using the previously defined environment variables in the container and
             * any service environment variables. If a variable cannot be resolved,
             * the reference in the input string will be unchanged. Double $$ are reduced
             * to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e.
             * "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
             * Escaped references will never be expanded, regardless of whether the variable
             * exists or not.
             * Defaults to "".
             */
            value?: string;
            /**
             * Source for the environment variable's value. Cannot be used if value is not empty.
             */
            valueFrom?: {
              /**
               * Selects a key of a ConfigMap.
               */
              configMapKeyRef?: {
                /**
                 * The key to select.
                 */
                key: string;
                /**
                 * Name of the referent.
                 * This field is effectively required, but due to backwards compatibility is
                 * allowed to be empty. Instances of this type with an empty value here are
                 * almost certainly wrong.
                 * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                 */
                name?: string;
                /**
                 * Specify whether the ConfigMap or its key must be defined
                 */
                optional?: boolean;
              };
              /**
               * Selects a field of the pod: supports metadata.name, metadata.namespace, `metadata.labels['<KEY>']`, `metadata.annotations['<KEY>']`,
               * spec.nodeName, spec.serviceAccountName, status.hostIP, status.podIP, status.podIPs.
               */
              fieldRef?: {
                /**
                 * Version of the schema the FieldPath is written in terms of, defaults to "v1".
                 */
                apiVersion?: string;
                /**
                 * Path of the field to select in the specified API version.
                 */
                fieldPath: string;
              };
              /**
               * Selects a resource of the container: only resources limits and requests
               * (limits.cpu, limits.memory, limits.ephemeral-storage, requests.cpu, requests.memory and requests.ephemeral-storage) are currently supported.
               */
              resourceFieldRef?: {
                /**
                 * Container name: required for volumes, optional for env vars
                 */
                containerName?: string;
                /**
                 * Specifies the output format of the exposed resources, defaults to "1"
                 */
                divisor?: number | string;
                /**
                 * Required: resource to select
                 */
                resource: string;
              };
              /**
               * Selects a key of a secret in the pod's namespace
               */
              secretKeyRef?: {
                /**
                 * The key of the secret to select from.  Must be a valid secret key.
                 */
                key: string;
                /**
                 * Name of the referent.
                 * This field is effectively required, but due to backwards compatibility is
                 * allowed to be empty. Instances of this type with an empty value here are
                 * almost certainly wrong.
                 * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                 */
                name?: string;
                /**
                 * Specify whether the Secret or its key must be defined
                 */
                optional?: boolean;
              };
            };
          }[];
          /**
           * extraVolumes is an extra set of host volumes, mounted to the control plane component.
           */
          extraVolumes?: {
            /**
             * hostPath is the path in the host that will be mounted inside
             * the pod.
             */
            hostPath: string;
            /**
             * mountPath is the path inside the pod where hostPath will be mounted.
             */
            mountPath: string;
            /**
             * name of the volume inside the pod template.
             */
            name: string;
            /**
             * pathType is the type of the HostPath.
             */
            pathType?: string;
            /**
             * readOnly controls write access to the volume
             */
            readOnly?: boolean;
          }[];
        };
      };
      /**
       * diskSetup specifies options for the creation of partition tables and file systems on devices.
       */
      diskSetup?: {
        /**
         * filesystems specifies the list of file systems to setup.
         */
        filesystems?: {
          /**
           * device specifies the device name
           */
          device: string;
          /**
           * extraOpts defined extra options to add to the command for creating the file system.
           */
          extraOpts?: string[];
          /**
           * filesystem specifies the file system type.
           */
          filesystem: string;
          /**
           * label specifies the file system label to be used. If set to None, no label is used.
           */
          label: string;
          /**
           * overwrite defines whether or not to overwrite any existing filesystem.
           * If true, any pre-existing file system will be destroyed. Use with Caution.
           */
          overwrite?: boolean;
          /**
           * partition specifies the partition to use. The valid options are: "auto|any", "auto", "any", "none", and <NUM>, where NUM is the actual partition number.
           */
          partition?: string;
          /**
           * replaceFS is a special directive, used for Microsoft Azure that instructs cloud-init to replace a file system of <FS_TYPE>.
           * NOTE: unless you define a label, this requires the use of the 'any' partition directive.
           */
          replaceFS?: string;
        }[];
        /**
         * partitions specifies the list of the partitions to setup.
         */
        partitions?: {
          /**
           * device is the name of the device.
           */
          device: string;
          /**
           * layout specifies the device layout.
           * If it is true, a single partition will be created for the entire device.
           * When layout is false, it means don't partition or ignore existing partitioning.
           */
          layout: boolean;
          /**
           * overwrite describes whether to skip checks and create the partition if a partition or filesystem is found on the device.
           * Use with caution. Default is 'false'.
           */
          overwrite?: boolean;
          /**
           * tableType specifies the tupe of partition table. The following are supported:
           * 'mbr': default and setups a MS-DOS partition table
           * 'gpt': setups a GPT partition table
           */
          tableType?: string;
        }[];
      };
      /**
       * files specifies extra files to be passed to user_data upon creation.
       */
      files?: {
        /**
         * append specifies whether to append Content to existing file if Path exists.
         */
        append?: boolean;
        /**
         * content is the actual content of the file.
         */
        content?: string;
        /**
         * contentFrom is a referenced source of content to populate the file.
         */
        contentFrom?: {
          /**
           * secret represents a secret that should populate this file.
           */
          secret: {
            /**
             * key is the key in the secret's data map for this value.
             */
            key: string;
            /**
             * name of the secret in the KubeadmBootstrapConfig's namespace to use.
             */
            name: string;
          };
        };
        /**
         * encoding specifies the encoding of the file contents.
         */
        encoding?: 'base64' | 'gzip' | 'gzip+base64';
        /**
         * owner specifies the ownership of the file, e.g. "root:root".
         */
        owner?: string;
        /**
         * path specifies the full path on disk where to store the file.
         */
        path: string;
        /**
         * permissions specifies the permissions to assign to the file, e.g. "0640".
         */
        permissions?: string;
      }[];
      /**
       * format specifies the output format of the bootstrap data
       */
      format?: 'cloud-config' | 'ignition';
      /**
       * ignition contains Ignition specific configuration.
       */
      ignition?: {
        /**
         * containerLinuxConfig contains CLC specific configuration.
         */
        containerLinuxConfig?: {
          /**
           * additionalConfig contains additional configuration to be merged with the Ignition
           * configuration generated by the bootstrapper controller. More info: https://coreos.github.io/ignition/operator-notes/#config-merging
           *
           * The data format is documented here: https://kinvolk.io/docs/flatcar-container-linux/latest/provisioning/cl-config/
           */
          additionalConfig?: string;
          /**
           * strict controls if AdditionalConfig should be strictly parsed. If so, warnings are treated as errors.
           */
          strict?: boolean;
        };
      };
      /**
       * initConfiguration along with ClusterConfiguration are the configurations necessary for the init command
       */
      initConfiguration?: {
        /**
         * APIVersion defines the versioned schema of this representation of an object.
         * Servers should convert recognized schemas to the latest internal value, and
         * may reject unrecognized values.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
         */
        apiVersion?: string;
        /**
         * bootstrapTokens is respected at `kubeadm init` time and describes a set of Bootstrap Tokens to create.
         * This information IS NOT uploaded to the kubeadm cluster configmap, partly because of its sensitive nature
         */
        bootstrapTokens?: {
          /**
           * description sets a human-friendly message why this token exists and what it's used
           * for, so other administrators can know its purpose.
           */
          description?: string;
          /**
           * expires specifies the timestamp when this token expires. Defaults to being set
           * dynamically at runtime based on the TTL. Expires and TTL are mutually exclusive.
           */
          expires?: string;
          /**
           * groups specifies the extra groups that this token will authenticate as when/if
           * used for authentication
           */
          groups?: string[];
          /**
           * token is used for establishing bidirectional trust between nodes and control-planes.
           * Used for joining nodes in the cluster.
           */
          token: string;
          /**
           * ttl defines the time to live for this token. Defaults to 24h.
           * Expires and TTL are mutually exclusive.
           */
          ttl?: string;
          /**
           * usages describes the ways in which this token can be used. Can by default be used
           * for establishing bidirectional trust, but that can be changed here.
           */
          usages?: string[];
        }[];
        /**
         * Kind is a string value representing the REST resource this object represents.
         * Servers may infer this from the endpoint the client submits requests to.
         * Cannot be updated.
         * In CamelCase.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
         */
        kind?: string;
        /**
         * localAPIEndpoint represents the endpoint of the API server instance that's deployed on this control plane node
         * In HA setups, this differs from ClusterConfiguration.ControlPlaneEndpoint in the sense that ControlPlaneEndpoint
         * is the global endpoint for the cluster, which then loadbalances the requests to each individual API server. This
         * configuration object lets you customize what IP/DNS name and port the local API server advertises it's accessible
         * on. By default, kubeadm tries to auto-detect the IP of the default interface and use that, but in case that process
         * fails you may set the desired value here.
         */
        localAPIEndpoint?: {
          /**
           * advertiseAddress sets the IP address for the API server to advertise.
           */
          advertiseAddress?: string;
          /**
           * bindPort sets the secure port for the API Server to bind to.
           * Defaults to 6443.
           */
          bindPort?: number;
        };
        /**
         * nodeRegistration holds fields that relate to registering the new control-plane node to the cluster.
         * When used in the context of control plane nodes, NodeRegistration should remain consistent
         * across both InitConfiguration and JoinConfiguration
         */
        nodeRegistration?: {
          /**
           * criSocket is used to retrieve container runtime info. This information will be annotated to the Node API object, for later re-use
           */
          criSocket?: string;
          /**
           * ignorePreflightErrors provides a slice of pre-flight errors to be ignored when the current node is registered.
           */
          ignorePreflightErrors?: string[];
          /**
           * imagePullPolicy specifies the policy for image pulling
           * during kubeadm "init" and "join" operations. The value of
           * this field must be one of "Always", "IfNotPresent" or
           * "Never". Defaults to "IfNotPresent". This can be used only
           * with Kubernetes version equal to 1.22 and later.
           */
          imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
          /**
           * imagePullSerial specifies if image pulling performed by kubeadm must be done serially or in parallel.
           * This option takes effect only on Kubernetes >=1.31.0.
           * Default: true (defaulted in kubeadm)
           */
          imagePullSerial?: boolean;
          /**
           * kubeletExtraArgs passes through extra arguments to the kubelet. The arguments here are passed to the kubelet command line via the environment file
           * kubeadm writes at runtime for the kubelet to source. This overrides the generic base-level configuration in the kubelet-config-1.X ConfigMap
           * Flags have higher priority when parsing. These values are local and specific to the node kubeadm is executing on.
           */
          kubeletExtraArgs?: {
            [k: string]: string;
          };
          /**
           * name is the `.Metadata.Name` field of the Node API object that will be created in this `kubeadm init` or `kubeadm join` operation.
           * This field is also used in the CommonName field of the kubelet's client certificate to the API server.
           * Defaults to the hostname of the node if not provided.
           */
          name?: string;
          /**
           * taints specifies the taints the Node API object should be registered with. If this field is unset, i.e. nil, in the `kubeadm init` process
           * it will be defaulted to []v1.Taint{'node-role.kubernetes.io/master=""'}. If you don't want to taint your control-plane node, set this field to an
           * empty slice, i.e. `taints: []` in the YAML file. This field is solely used for Node registration.
           */
          taints?: {
            /**
             * Required. The effect of the taint on pods
             * that do not tolerate the taint.
             * Valid effects are NoSchedule, PreferNoSchedule and NoExecute.
             */
            effect: string;
            /**
             * Required. The taint key to be applied to a node.
             */
            key: string;
            /**
             * TimeAdded represents the time at which the taint was added.
             * It is only written for NoExecute taints.
             */
            timeAdded?: string;
            /**
             * The taint value corresponding to the taint key.
             */
            value?: string;
          }[];
        };
        /**
         * patches contains options related to applying patches to components deployed by kubeadm during
         * "kubeadm init". The minimum kubernetes version needed to support Patches is v1.22
         */
        patches?: {
          /**
           * directory is a path to a directory that contains files named "target[suffix][+patchtype].extension".
           * For example, "kube-apiserver0+merge.yaml" or just "etcd.json". "target" can be one of
           * "kube-apiserver", "kube-controller-manager", "kube-scheduler", "etcd". "patchtype" can be one
           * of "strategic" "merge" or "json" and they match the patch formats supported by kubectl.
           * The default "patchtype" is "strategic". "extension" must be either "json" or "yaml".
           * "suffix" is an optional string that can be used to determine which patches are applied
           * first alpha-numerically.
           * These files can be written into the target directory via KubeadmConfig.Files which
           * specifies additional files to be created on the machine, either with content inline or
           * by referencing a secret.
           */
          directory?: string;
        };
        /**
         * skipPhases is a list of phases to skip during command execution.
         * The list of phases can be obtained with the "kubeadm init --help" command.
         * This option takes effect only on Kubernetes >=1.22.0.
         */
        skipPhases?: string[];
      };
      /**
       * joinConfiguration is the kubeadm configuration for the join command
       */
      joinConfiguration?: {
        /**
         * APIVersion defines the versioned schema of this representation of an object.
         * Servers should convert recognized schemas to the latest internal value, and
         * may reject unrecognized values.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
         */
        apiVersion?: string;
        /**
         * caCertPath is the path to the SSL certificate authority used to
         * secure comunications between node and control-plane.
         * Defaults to "/etc/kubernetes/pki/ca.crt".
         */
        caCertPath?: string;
        /**
         * controlPlane defines the additional control plane instance to be deployed on the joining node.
         * If nil, no additional control plane instance will be deployed.
         */
        controlPlane?: {
          /**
           * localAPIEndpoint represents the endpoint of the API server instance to be deployed on this node.
           */
          localAPIEndpoint?: {
            /**
             * advertiseAddress sets the IP address for the API server to advertise.
             */
            advertiseAddress?: string;
            /**
             * bindPort sets the secure port for the API Server to bind to.
             * Defaults to 6443.
             */
            bindPort?: number;
          };
        };
        /**
         * discovery specifies the options for the kubelet to use during the TLS Bootstrap process
         */
        discovery?: {
          /**
           * bootstrapToken is used to set the options for bootstrap token based discovery
           * BootstrapToken and File are mutually exclusive
           */
          bootstrapToken?: {
            /**
             * apiServerEndpoint is an IP or domain name to the API server from which info will be fetched.
             */
            apiServerEndpoint?: string;
            /**
             * caCertHashes specifies a set of public key pins to verify
             * when token-based discovery is used. The root CA found during discovery
             * must match one of these values. Specifying an empty set disables root CA
             * pinning, which can be unsafe. Each hash is specified as "<type>:<value>",
             * where the only currently supported type is "sha256". This is a hex-encoded
             * SHA-256 hash of the Subject Public Key Info (SPKI) object in DER-encoded
             * ASN.1. These hashes can be calculated using, for example, OpenSSL:
             * openssl x509 -pubkey -in ca.crt openssl rsa -pubin -outform der 2>&/dev/null | openssl dgst -sha256 -hex
             */
            caCertHashes?: string[];
            /**
             * token is a token used to validate cluster information
             * fetched from the control-plane.
             */
            token: string;
            /**
             * unsafeSkipCAVerification allows token-based discovery
             * without CA verification via CACertHashes. This can weaken
             * the security of kubeadm since other nodes can impersonate the control-plane.
             */
            unsafeSkipCAVerification?: boolean;
          };
          /**
           * file is used to specify a file or URL to a kubeconfig file from which to load cluster information
           * BootstrapToken and File are mutually exclusive
           */
          file?: {
            /**
             * kubeConfig is used (optionally) to generate a KubeConfig based on the KubeadmConfig's information.
             * The file is generated at the path specified in KubeConfigPath.
             *
             * Host address (server field) information is automatically populated based on the Cluster's ControlPlaneEndpoint.
             * Certificate Authority (certificate-authority-data field) is gathered from the cluster's CA secret.
             */
            kubeConfig?: {
              /**
               * cluster contains information about how to communicate with the kubernetes cluster.
               *
               * By default the following fields are automatically populated:
               * - Server with the Cluster's ControlPlaneEndpoint.
               * - CertificateAuthorityData with the Cluster's CA certificate.
               */
              cluster?: {
                /**
                 * certificateAuthorityData contains PEM-encoded certificate authority certificates.
                 *
                 * Defaults to the Cluster's CA certificate if empty.
                 */
                certificateAuthorityData?: string;
                /**
                 * insecureSkipTLSVerify skips the validity check for the server's certificate. This will make your HTTPS connections insecure.
                 */
                insecureSkipTLSVerify?: boolean;
                /**
                 * proxyURL is the URL to the proxy to be used for all requests made by this
                 * client. URLs with "http", "https", and "socks5" schemes are supported.  If
                 * this configuration is not provided or the empty string, the client
                 * attempts to construct a proxy configuration from http_proxy and
                 * https_proxy environment variables. If these environment variables are not
                 * set, the client does not attempt to proxy requests.
                 *
                 * socks5 proxying does not currently support spdy streaming endpoints (exec,
                 * attach, port forward).
                 */
                proxyURL?: string;
                /**
                 * server is the address of the kubernetes cluster (https://hostname:port).
                 *
                 * Defaults to https:// + Cluster.Spec.ControlPlaneEndpoint.
                 */
                server?: string;
                /**
                 * tlsServerName is used to check server certificate. If TLSServerName is empty, the hostname used to contact the server is used.
                 */
                tlsServerName?: string;
              };
              /**
               * user contains information that describes identity information.
               * This is used to tell the kubernetes cluster who you are.
               */
              user: {
                /**
                 * authProvider specifies a custom authentication plugin for the kubernetes cluster.
                 */
                authProvider?: {
                  /**
                   * config holds the parameters for the authentication plugin.
                   */
                  config?: {
                    [k: string]: string;
                  };
                  /**
                   * name is the name of the authentication plugin.
                   */
                  name: string;
                };
                /**
                 * exec specifies a custom exec-based authentication plugin for the kubernetes cluster.
                 */
                exec?: {
                  /**
                   * apiVersion is preferred input version of the ExecInfo. The returned ExecCredentials MUST use
                   * the same encoding version as the input.
                   * Defaults to client.authentication.k8s.io/v1 if not set.
                   */
                  apiVersion?: string;
                  /**
                   * args is the arguments to pass to the command when executing it.
                   */
                  args?: string[];
                  /**
                   * command to execute.
                   */
                  command: string;
                  /**
                   * env defines additional environment variables to expose to the process. These
                   * are unioned with the host's environment, as well as variables client-go uses
                   * to pass argument to the plugin.
                   */
                  env?: {
                    name: string;
                    value: string;
                  }[];
                  /**
                   * provideClusterInfo determines whether or not to provide cluster information,
                   * which could potentially contain very large CA data, to this exec plugin as a
                   * part of the KUBERNETES_EXEC_INFO environment variable. By default, it is set
                   * to false. Package k8s.io/client-go/tools/auth/exec provides helper methods for
                   * reading this environment variable.
                   */
                  provideClusterInfo?: boolean;
                };
              };
            };
            /**
             * kubeConfigPath is used to specify the actual file path or URL to the kubeconfig file from which to load cluster information
             */
            kubeConfigPath: string;
          };
          /**
           * timeout modifies the discovery timeout
           */
          timeout?: string;
          /**
           * tlsBootstrapToken is a token used for TLS bootstrapping.
           * If .BootstrapToken is set, this field is defaulted to .BootstrapToken.Token, but can be overridden.
           * If .File is set, this field **must be set** in case the KubeConfigFile does not contain any other authentication information
           */
          tlsBootstrapToken?: string;
        };
        /**
         * Kind is a string value representing the REST resource this object represents.
         * Servers may infer this from the endpoint the client submits requests to.
         * Cannot be updated.
         * In CamelCase.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
         */
        kind?: string;
        /**
         * nodeRegistration holds fields that relate to registering the new control-plane node to the cluster.
         * When used in the context of control plane nodes, NodeRegistration should remain consistent
         * across both InitConfiguration and JoinConfiguration
         */
        nodeRegistration?: {
          /**
           * criSocket is used to retrieve container runtime info. This information will be annotated to the Node API object, for later re-use
           */
          criSocket?: string;
          /**
           * ignorePreflightErrors provides a slice of pre-flight errors to be ignored when the current node is registered.
           */
          ignorePreflightErrors?: string[];
          /**
           * imagePullPolicy specifies the policy for image pulling
           * during kubeadm "init" and "join" operations. The value of
           * this field must be one of "Always", "IfNotPresent" or
           * "Never". Defaults to "IfNotPresent". This can be used only
           * with Kubernetes version equal to 1.22 and later.
           */
          imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
          /**
           * imagePullSerial specifies if image pulling performed by kubeadm must be done serially or in parallel.
           * This option takes effect only on Kubernetes >=1.31.0.
           * Default: true (defaulted in kubeadm)
           */
          imagePullSerial?: boolean;
          /**
           * kubeletExtraArgs passes through extra arguments to the kubelet. The arguments here are passed to the kubelet command line via the environment file
           * kubeadm writes at runtime for the kubelet to source. This overrides the generic base-level configuration in the kubelet-config-1.X ConfigMap
           * Flags have higher priority when parsing. These values are local and specific to the node kubeadm is executing on.
           */
          kubeletExtraArgs?: {
            [k: string]: string;
          };
          /**
           * name is the `.Metadata.Name` field of the Node API object that will be created in this `kubeadm init` or `kubeadm join` operation.
           * This field is also used in the CommonName field of the kubelet's client certificate to the API server.
           * Defaults to the hostname of the node if not provided.
           */
          name?: string;
          /**
           * taints specifies the taints the Node API object should be registered with. If this field is unset, i.e. nil, in the `kubeadm init` process
           * it will be defaulted to []v1.Taint{'node-role.kubernetes.io/master=""'}. If you don't want to taint your control-plane node, set this field to an
           * empty slice, i.e. `taints: []` in the YAML file. This field is solely used for Node registration.
           */
          taints?: {
            /**
             * Required. The effect of the taint on pods
             * that do not tolerate the taint.
             * Valid effects are NoSchedule, PreferNoSchedule and NoExecute.
             */
            effect: string;
            /**
             * Required. The taint key to be applied to a node.
             */
            key: string;
            /**
             * TimeAdded represents the time at which the taint was added.
             * It is only written for NoExecute taints.
             */
            timeAdded?: string;
            /**
             * The taint value corresponding to the taint key.
             */
            value?: string;
          }[];
        };
        /**
         * patches contains options related to applying patches to components deployed by kubeadm during
         * "kubeadm join". The minimum kubernetes version needed to support Patches is v1.22
         */
        patches?: {
          /**
           * directory is a path to a directory that contains files named "target[suffix][+patchtype].extension".
           * For example, "kube-apiserver0+merge.yaml" or just "etcd.json". "target" can be one of
           * "kube-apiserver", "kube-controller-manager", "kube-scheduler", "etcd". "patchtype" can be one
           * of "strategic" "merge" or "json" and they match the patch formats supported by kubectl.
           * The default "patchtype" is "strategic". "extension" must be either "json" or "yaml".
           * "suffix" is an optional string that can be used to determine which patches are applied
           * first alpha-numerically.
           * These files can be written into the target directory via KubeadmConfig.Files which
           * specifies additional files to be created on the machine, either with content inline or
           * by referencing a secret.
           */
          directory?: string;
        };
        /**
         * skipPhases is a list of phases to skip during command execution.
         * The list of phases can be obtained with the "kubeadm init --help" command.
         * This option takes effect only on Kubernetes >=1.22.0.
         */
        skipPhases?: string[];
      };
      /**
       * mounts specifies a list of mount points to be setup.
       */
      mounts?: string[][];
      /**
       * ntp specifies NTP configuration
       */
      ntp?: {
        /**
         * enabled specifies whether NTP should be enabled
         */
        enabled?: boolean;
        /**
         * servers specifies which NTP servers to use
         */
        servers?: string[];
      };
      /**
       * postKubeadmCommands specifies extra commands to run after kubeadm runs
       */
      postKubeadmCommands?: string[];
      /**
       * preKubeadmCommands specifies extra commands to run before kubeadm runs
       */
      preKubeadmCommands?: string[];
      /**
       * useExperimentalRetryJoin replaces a basic kubeadm command with a shell
       * script with retries for joins.
       *
       * This is meant to be an experimental temporary workaround on some environments
       * where joins fail due to timing (and other issues). The long term goal is to add retries to
       * kubeadm proper and use that functionality.
       *
       * This will add about 40KB to userdata
       *
       * For more information, refer to https://github.com/kubernetes-sigs/cluster-api/pull/2763#discussion_r397306055.
       *
       * Deprecated: This experimental fix is no longer needed and this field will be removed in a future release.
       * When removing also remove from staticcheck exclude-rules for SA1019 in golangci.yml
       */
      useExperimentalRetryJoin?: boolean;
      /**
       * users specifies extra users to add
       */
      users?: {
        /**
         * gecos specifies the gecos to use for the user
         */
        gecos?: string;
        /**
         * groups specifies the additional groups for the user
         */
        groups?: string;
        /**
         * homeDir specifies the home directory to use for the user
         */
        homeDir?: string;
        /**
         * inactive specifies whether to mark the user as inactive
         */
        inactive?: boolean;
        /**
         * lockPassword specifies if password login should be disabled
         */
        lockPassword?: boolean;
        /**
         * name specifies the user name
         */
        name: string;
        /**
         * passwd specifies a hashed password for the user
         */
        passwd?: string;
        /**
         * passwdFrom is a referenced source of passwd to populate the passwd.
         */
        passwdFrom?: {
          /**
           * secret represents a secret that should populate this password.
           */
          secret: {
            /**
             * key is the key in the secret's data map for this value.
             */
            key: string;
            /**
             * name of the secret in the KubeadmBootstrapConfig's namespace to use.
             */
            name: string;
          };
        };
        /**
         * primaryGroup specifies the primary group for the user
         */
        primaryGroup?: string;
        /**
         * shell specifies the user's shell
         */
        shell?: string;
        /**
         * sshAuthorizedKeys specifies a list of ssh authorized keys for the user
         */
        sshAuthorizedKeys?: string[];
        /**
         * sudo specifies a sudo role for the user
         */
        sudo?: string;
      }[];
      /**
       * verbosity is the number for the kubeadm log level verbosity.
       * It overrides the `--v` flag in kubeadm commands.
       */
      verbosity?: number;
    };
    /**
     * machineNamingStrategy allows changing the naming pattern used when creating Machines.
     * InfraMachines & KubeadmConfigs will use the same name as the corresponding Machines.
     */
    machineNamingStrategy?: {
      /**
       * template defines the template to use for generating the names of the Machine objects.
       * If not defined, it will fallback to `{{ .kubeadmControlPlane.name }}-{{ .random }}`.
       * If the generated name string exceeds 63 characters, it will be trimmed to 58 characters and will
       * get concatenated with a random suffix of length 5.
       * Length of the template string must not exceed 256 characters.
       * The template allows the following variables `.cluster.name`, `.kubeadmControlPlane.name` and `.random`.
       * The variable `.cluster.name` retrieves the name of the cluster object that owns the Machines being created.
       * The variable `.kubeadmControlPlane.name` retrieves the name of the KubeadmControlPlane object that owns the Machines being created.
       * The variable `.random` is substituted with random alphanumeric string, without vowels, of length 5. This variable is required
       * part of the template. If not provided, validation will fail.
       */
      template?: string;
    };
    /**
     * machineTemplate contains information about how machines
     * should be shaped when creating or updating a control plane.
     */
    machineTemplate: {
      /**
       * infrastructureRef is a required reference to a custom resource
       * offered by an infrastructure provider.
       */
      infrastructureRef: {
        /**
         * API version of the referent.
         */
        apiVersion?: string;
        /**
         * If referring to a piece of an object instead of an entire object, this string
         * should contain a valid JSON/Go field access statement, such as desiredState.manifest.containers[2].
         * For example, if the object reference is to a container within a pod, this would take on a value like:
         * "spec.containers{name}" (where "name" refers to the name of the container that triggered
         * the event) or if no container name is specified "spec.containers[2]" (container with
         * index 2 in this pod). This syntax is chosen only to have some well-defined way of
         * referencing a part of an object.
         */
        fieldPath?: string;
        /**
         * Kind of the referent.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
         */
        kind?: string;
        /**
         * Name of the referent.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
         */
        name?: string;
        /**
         * Namespace of the referent.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
         */
        namespace?: string;
        /**
         * Specific resourceVersion to which this reference is made, if any.
         * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
         */
        resourceVersion?: string;
        /**
         * UID of the referent.
         * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids
         */
        uid?: string;
      };
      /**
       * metadata is the standard object's metadata.
       * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata
       */
      metadata?: {
        /**
         * annotations is an unstructured key value map stored with a resource that may be
         * set by external tools to store and retrieve arbitrary metadata. They are not
         * queryable and should be preserved when modifying objects.
         * More info: http://kubernetes.io/docs/user-guide/annotations
         */
        annotations?: {
          [k: string]: string;
        };
        /**
         * labels is a map of string keys and values that can be used to organize and categorize
         * (scope and select) objects. May match selectors of replication controllers
         * and services.
         * More info: http://kubernetes.io/docs/user-guide/labels
         */
        labels?: {
          [k: string]: string;
        };
      };
      /**
       * nodeDeletionTimeout defines how long the machine controller will attempt to delete the Node that the Machine
       * hosts after the Machine is marked for deletion. A duration of 0 will retry deletion indefinitely.
       * If no value is provided, the default value for this property of the Machine resource will be used.
       */
      nodeDeletionTimeout?: string;
      /**
       * nodeDrainTimeout is the total amount of time that the controller will spend on draining a controlplane node
       * The default value is 0, meaning that the node can be drained without any time limitations.
       * NOTE: NodeDrainTimeout is different from `kubectl drain --timeout`
       */
      nodeDrainTimeout?: string;
      /**
       * nodeVolumeDetachTimeout is the total amount of time that the controller will spend on waiting for all volumes
       * to be detached. The default value is 0, meaning that the volumes can be detached without any time limitations.
       */
      nodeVolumeDetachTimeout?: string;
    };
    /**
     * remediationStrategy is the RemediationStrategy that controls how control plane machine remediation happens.
     */
    remediationStrategy?: {
      /**
       * maxRetry is the Max number of retries while attempting to remediate an unhealthy machine.
       * A retry happens when a machine that was created as a replacement for an unhealthy machine also fails.
       * For example, given a control plane with three machines M1, M2, M3:
       *
       * 	M1 become unhealthy; remediation happens, and M1-1 is created as a replacement.
       * 	If M1-1 (replacement of M1) has problems while bootstrapping it will become unhealthy, and then be
       * 	remediated; such operation is considered a retry, remediation-retry #1.
       * 	If M1-2 (replacement of M1-1) becomes unhealthy, remediation-retry #2 will happen, etc.
       *
       * A retry could happen only after RetryPeriod from the previous retry.
       * If a machine is marked as unhealthy after MinHealthyPeriod from the previous remediation expired,
       * this is not considered a retry anymore because the new issue is assumed unrelated from the previous one.
       *
       * If not set, the remedation will be retried infinitely.
       */
      maxRetry?: number;
      /**
       * minHealthyPeriod defines the duration after which KCP will consider any failure to a machine unrelated
       * from the previous one. In this case the remediation is not considered a retry anymore, and thus the retry
       * counter restarts from 0. For example, assuming MinHealthyPeriod is set to 1h (default)
       *
       * 	M1 become unhealthy; remediation happens, and M1-1 is created as a replacement.
       * 	If M1-1 (replacement of M1) has problems within the 1hr after the creation, also
       * 	this machine will be remediated and this operation is considered a retry - a problem related
       * 	to the original issue happened to M1 -.
       *
       * 	If instead the problem on M1-1 is happening after MinHealthyPeriod expired, e.g. four days after
       * 	m1-1 has been created as a remediation of M1, the problem on M1-1 is considered unrelated to
       * 	the original issue happened to M1.
       *
       * If not set, this value is defaulted to 1h.
       */
      minHealthyPeriod?: string;
      /**
       * retryPeriod is the duration that KCP should wait before remediating a machine being created as a replacement
       * for an unhealthy machine (a retry).
       *
       * If not set, a retry will happen immediately.
       */
      retryPeriod?: string;
    };
    /**
     * replicas is the number of desired machines. Defaults to 1. When stacked etcd is used only
     * odd numbers are permitted, as per [etcd best practice](https://etcd.io/docs/v3.3.12/faq/#why-an-odd-number-of-cluster-members).
     * This is a pointer to distinguish between explicit zero and not specified.
     */
    replicas?: number;
    /**
     * rolloutAfter is a field to indicate a rollout should be performed
     * after the specified time even if no changes have been made to the
     * KubeadmControlPlane.
     * Example: In the YAML the time can be specified in the RFC3339 format.
     * To specify the rolloutAfter target as March 9, 2023, at 9 am UTC
     * use "2023-03-09T09:00:00Z".
     */
    rolloutAfter?: string;
    /**
     * rolloutBefore is a field to indicate a rollout should be performed
     * if the specified criteria is met.
     */
    rolloutBefore?: {
      /**
       * certificatesExpiryDays indicates a rollout needs to be performed if the
       * certificates of the machine will expire within the specified days.
       */
      certificatesExpiryDays?: number;
    };
    /**
     * rolloutStrategy is the RolloutStrategy to use to replace control plane machines with
     * new ones.
     */
    rolloutStrategy?: {
      /**
       * rollingUpdate is the rolling update config params. Present only if
       * RolloutStrategyType = RollingUpdate.
       */
      rollingUpdate?: {
        /**
         * maxSurge is the maximum number of control planes that can be scheduled above or under the
         * desired number of control planes.
         * Value can be an absolute number 1 or 0.
         * Defaults to 1.
         * Example: when this is set to 1, the control plane can be scaled
         * up immediately when the rolling update starts.
         */
        maxSurge?: number | string;
      };
      /**
       * type of rollout. Currently the only supported strategy is
       * "RollingUpdate".
       * Default is RollingUpdate.
       */
      type?: string;
    };
    /**
     * version defines the desired Kubernetes version.
     * Please note that if kubeadmConfigSpec.ClusterConfiguration.imageRepository is not set
     * we don't allow upgrades to versions >= v1.22.0 for which kubeadm uses the old registry (k8s.gcr.io).
     * Please use a newer patch version with the new registry instead. The default registries of kubeadm are:
     *   * registry.k8s.io (new registry): >= v1.22.17, >= v1.23.15, >= v1.24.9, >= v1.25.0
     *   * k8s.gcr.io (old registry): all older versions
     */
    version: string;
  };
  /**
   * KubeadmControlPlaneStatus defines the observed state of KubeadmControlPlane.
   */
  status?: {
    /**
     * conditions defines current service state of the KubeadmControlPlane.
     */
    conditions?: {
      /**
       * lastTransitionTime is the last time the condition transitioned from one status to another.
       * This should be when the underlying condition changed. If that is not known, then using the time when
       * the API field changed is acceptable.
       */
      lastTransitionTime: string;
      /**
       * message is a human readable message indicating details about the transition.
       * This field may be empty.
       */
      message?: string;
      /**
       * reason is the reason for the condition's last transition in CamelCase.
       * The specific API may choose whether or not this field is considered a guaranteed API.
       * This field may be empty.
       */
      reason?: string;
      /**
       * severity provides an explicit classification of Reason code, so the users or machines can immediately
       * understand the current situation and act accordingly.
       * The Severity field MUST be set only when Status=False.
       */
      severity?: string;
      /**
       * status of the condition, one of True, False, Unknown.
       */
      status: string;
      /**
       * type of condition in CamelCase or in foo.example.com/CamelCase.
       * Many .condition.type values are consistent across resources like Available, but because arbitrary conditions
       * can be useful (see .node.status.conditions), the ability to deconflict is important.
       */
      type: string;
    }[];
    /**
     * failureMessage indicates that there is a terminal problem reconciling the
     * state, and will be set to a descriptive error message.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    failureMessage?: string;
    /**
     * failureReason indicates that there is a terminal problem reconciling the
     * state, and will be set to a token value suitable for
     * programmatic interpretation.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    failureReason?: string;
    /**
     * initialized denotes that the KubeadmControlPlane API Server is initialized and thus
     * it can accept requests.
     * NOTE: this field is part of the Cluster API contract and it is used to orchestrate provisioning.
     * The value of this field is never updated after provisioning is completed. Please use conditions
     * to check the operational state of the control plane.
     */
    initialized?: boolean;
    /**
     * lastRemediation stores info about last remediation performed.
     */
    lastRemediation?: {
      /**
       * machine is the machine name of the latest machine being remediated.
       */
      machine: string;
      /**
       * retryCount used to keep track of remediation retry for the last remediated machine.
       * A retry happens when a machine that was created as a replacement for an unhealthy machine also fails.
       */
      retryCount: number;
      /**
       * timestamp is when last remediation happened. It is represented in RFC3339 form and is in UTC.
       */
      timestamp: string;
    };
    /**
     * observedGeneration is the latest generation observed by the controller.
     */
    observedGeneration?: number;
    /**
     * ready denotes that the KubeadmControlPlane API Server became ready during initial provisioning
     * to receive requests.
     * NOTE: this field is part of the Cluster API contract and it is used to orchestrate provisioning.
     * The value of this field is never updated after provisioning is completed. Please use conditions
     * to check the operational state of the control plane.
     */
    ready?: boolean;
    /**
     * readyReplicas is the total number of fully running and ready control plane machines.
     */
    readyReplicas?: number;
    /**
     * replicas is the total number of non-terminated machines targeted by this control plane
     * (their labels match the selector).
     */
    replicas?: number;
    /**
     * selector is the label selector in string format to avoid introspection
     * by clients, and is used to provide the CRD-based integration for the
     * scale subresource and additional integrations for things like kubectl
     * describe.. The string will be in the same format as the query-param syntax.
     * More info about label selectors: http://kubernetes.io/docs/user-guide/labels#label-selectors
     */
    selector?: string;
    /**
     * unavailableReplicas is the total number of unavailable machines targeted by this control plane.
     * This is the total number of machines that are still required for
     * the deployment to have 100% available capacity. They may either
     * be machines that are running but not yet ready or machines
     * that still have not been created.
     *
     * Deprecated: This field is deprecated and is going to be removed in the next apiVersion. Please see https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20240916-improve-status-in-CAPI-resources.md for more details.
     */
    unavailableReplicas?: number;
    /**
     * updatedReplicas is the total number of non-terminated machines targeted by this control plane
     * that have the desired template spec.
     */
    updatedReplicas?: number;
    /**
     * v1beta2 groups all the fields that will be added or modified in KubeadmControlPlane's status with the V1Beta2 version.
     */
    v1beta2?: {
      /**
       * availableReplicas is the number of available replicas targeted by this KubeadmControlPlane. A machine is considered available when Machine's Available condition is true.
       */
      availableReplicas?: number;
      /**
       * conditions represents the observations of a KubeadmControlPlane's current state.
       * Known condition types are Available, CertificatesAvailable, EtcdClusterAvailable, MachinesReady, MachinesUpToDate,
       * ScalingUp, ScalingDown, Remediating, Deleting, Paused.
       *
       * @maxItems 32
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
       * readyReplicas is the number of ready replicas for this KubeadmControlPlane. A machine is considered ready when Machine's Ready condition is true.
       */
      readyReplicas?: number;
      /**
       * upToDateReplicas is the number of up-to-date replicas targeted by this KubeadmControlPlane. A machine is considered up-to-date when Machine's UpToDate condition is true.
       */
      upToDateReplicas?: number;
    };
    /**
     * version represents the minimum Kubernetes version for the control plane machines
     * in the cluster.
     */
    version?: string;
  };
}

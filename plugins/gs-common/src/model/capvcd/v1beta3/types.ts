/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * VCDCluster is the Schema for the vcdclusters API
 */
export interface IVCDCluster {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1beta3';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'VCDCluster';
  metadata: metav1.IObjectMeta;
  /**
   * VCDClusterSpec defines the desired state of VCDCluster
   */
  spec?: {
    /**
     * APIEndpoint represents a reachable Kubernetes API endpoint.
     */
    controlPlaneEndpoint?: {
      /**
       * Host is the hostname on which the API server is serving.
       */
      host: string;
      /**
       * Port is the port on which the API server is serving.
       */
      port: number;
    };
    /**
     * LoadBalancerConfig defines load-balancer configuration for the Cluster both for the control plane nodes and for the CPI
     */
    loadBalancerConfigSpec?: {
      /**
       * UseOneArm defines the intent to une OneArm when upgrading CAPVCD from 0.5.x to 1.0.0
       */
      useOneArm?: boolean;
      vipSubnet?: string;
    };
    /**
     * MultiZoneSpec provides details of the configuration of the zones in the cluster as well as the NetworkTopologyType
     * used.
     */
    multiZoneSpec?: {
      /**
       * DCGroupConfig contains configuration for DCGroup zone topology.
       */
      dcGroupConfig?: {};
      /**
       * ZoneTopology defines the type of network topology used across zones in a Multi-AZ deployment.
       * Valid options are DCGroup, UserSpecifiedEdgeGateway, and ExternalLoadBalancer,
       */
      zoneTopology?: string;
      /**
       * Zones defines the list of zones that this cluster should be deployed to.
       */
      zones?: {
        /**
         * ControlPlaneZone defines whether a control plane node can be deployed to this zone.
         */
        controlPlaneZone: boolean;
        /**
         * Name defines the name of this zone.
         */
        name: string;
        /**
         * OVDC defines the name or URN-ID of the OVDC which corresponds to this zone.
         */
        ovdc: string;
        /**
         * OVDCNetworkName defines the OVDC network for this zone.
         */
        ovdcNetworkName: string;
      }[];
    };
    org: string;
    /**
     * OVDCZoneConfigMap defines the name of a config map storing the mapping Zone -> OVDC in a Multi-AZ
     * deployment. e.g. zone1 -> ovdc1, zone2 -> ovdc2
     */
    ovcdZoneConfigMap?: string;
    ovdc?: string;
    ovdcNetwork?: string;
    parentUid?: string;
    /**
     * ProxyConfig defines HTTP proxy environment variables for containerd
     */
    proxyConfigSpec?: {
      httpProxy?: string;
      httpsProxy?: string;
      noProxy?: string;
    };
    rdeId?: string;
    site: string;
    useAsManagementCluster?: boolean;
    userContext: {
      password?: string;
      refreshToken?: string;
      /**
       * SecretReference represents a Secret Reference. It has enough information to retrieve secret
       * in any namespace
       */
      secretRef?: {
        /**
         * name is unique within a namespace to reference a secret resource.
         */
        name?: string;
        /**
         * namespace defines the space within which the secret name must be unique.
         */
        namespace?: string;
      };
      username?: string;
    };
  };
  /**
   * VCDClusterStatus defines the observed state of VCDCluster
   */
  status?: {
    /**
     * Conditions defines current service state of the VCDCluster.
     */
    conditions?: {
      /**
       * Last time the condition transitioned from one status to another.
       * This should be when the underlying condition changed. If that is not known, then using the time when
       * the API field changed is acceptable.
       */
      lastTransitionTime: string;
      /**
       * A human readable message indicating details about the transition.
       * This field may be empty.
       */
      message?: string;
      /**
       * The reason for the condition's last transition in CamelCase.
       * The specific API may choose whether or not this field is considered a guaranteed API.
       * This field may not be empty.
       */
      reason?: string;
      /**
       * Severity provides an explicit classification of Reason code, so the users or machines can immediately
       * understand the current situation and act accordingly.
       * The Severity field MUST be set only when Status=False.
       */
      severity?: string;
      /**
       * Status of the condition, one of True, False, Unknown.
       */
      status: string;
      /**
       * Type of condition in CamelCase or in foo.example.com/CamelCase.
       * Many .condition.type values are consistent across resources like Available, but because arbitrary conditions
       * can be useful (see .node.status.conditions), the ability to deconflict is important.
       */
      type: string;
    }[];
    /**
     * FailureDomains lists the zones of this cluster. This field is parsed from the Zones field of
     * vcdCluster.Spec.MultiZoneSpec if set up appropriately.
     */
    failureDomains?: {
      /**
       * FailureDomainSpec is the Schema for Cluster API failure domains.
       * It allows controllers to understand how many failure domains a cluster can optionally span across.
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
    infraId?: string;
    /**
     * LoadBalancerConfig defines load-balancer configuration for the Cluster both for the control plane nodes and for the CPI
     */
    loadBalancerConfig?: {
      /**
       * UseOneArm defines the intent to une OneArm when upgrading CAPVCD from 0.5.x to 1.0.0
       */
      useOneArm?: boolean;
      vipSubnet?: string;
    };
    /**
     * MultiZoneStatus provides the current status of the multi-zone configuration in a Multi-AZ deployment
     */
    multiZoneStatus?: {
      /**
       * DCGroupConfig contains configuration for DCGroup zone topology.
       */
      dcGroupConfig?: {};
      /**
       * ZoneTopology defines the type of network topology used across zones in a Multi-AZ deployment.
       * Valid options are DCGroup, UserSpecifiedEdgeGateway, and ExternalLoadBalancer
       */
      zoneTopology?: string;
      /**
       * Zones defines the list of zones this cluster is configured with for a Mult-AZ deployment.
       */
      zones?: {
        /**
         * ControlPlaneZone defines whether a control plane node can be deployed to this zone.
         */
        controlPlaneZone: boolean;
        /**
         * Name defines the name of this zone.
         */
        name: string;
        /**
         * OVDC defines the name or URN-ID of the OVDC which corresponds to this zone.
         */
        ovdc: string;
        /**
         * OVDCNetworkName defines the OVDC network for this zone.
         */
        ovdcNetworkName: string;
      }[];
    };
    /**
     * optional
     */
    org?: string;
    /**
     * optional
     */
    ovdc?: string;
    /**
     * optional
     */
    ovdcNetwork?: string;
    parentUid?: string;
    /**
     * ProxyConfig defines HTTP proxy environment variables for containerd
     */
    proxyConfig?: {
      httpProxy?: string;
      httpsProxy?: string;
      noProxy?: string;
    };
    /**
     * RdeVersionInUse indicates the version of capvcdCluster entity type used by CAPVCD.
     */
    rdeVersionInUse: string;
    /**
     * Ready denotes that the vcd cluster (infrastructure) is ready.
     */
    ready: boolean;
    /**
     * optional
     */
    site?: string;
    useAsManagementCluster?: boolean;
    /**
     * MetadataUpdated denotes that the metadata of Vapp is updated.
     */
    vappMetadataUpdated?: boolean;
    /**
     * optional
     */
    vcdResourceMap?: {
      /**
       * VCDResources stores the latest ID and name of VCD resources for specific resource types.
       */
      ovdcs?: {
        id: string;
        name: string;
        type?: string;
      }[];
    };
  };
}

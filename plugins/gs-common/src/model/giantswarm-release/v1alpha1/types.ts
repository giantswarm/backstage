/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */
  
  import * as metav1 from '../../metav1';
  
/**
 * Release is a Kubernetes resource (CR) representing a Giant Swarm workload cluster release.
 */
export interface IRelease {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1alpha1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'Release';
  metadata: metav1.IObjectMeta;
  spec?: {
    /**
     * Apps describes apps used in this release.
     */
    apps: {
      /**
       * Catalog specifies the name of the app catalog that this app belongs to.
       */
      catalog?: string;
      /**
       * Version of the upstream component used in the app.
       */
      componentVersion?: string;
      /**
       * DependsOn is the list of apps that should be installed before installation of this one is attempted.
       */
      dependsOn?: string[];
      /**
       * Name of the app.
       */
      name: string;
      /**
       * Version of the app.
       */
      version: string;
    }[];
    /**
     * Components describes components used in this release.
     *
     * @minItems 1
     */
    components: [
      {
        /**
         * Catalog specifies the name of the app catalog that this component belongs to.
         */
        catalog?: string;
        /**
         * Name of the component.
         */
        name: string;
        /**
         * Reference is the component's version in the catalog (e.g. 1.2.3 or 1.2.3-abc8675309).
         */
        reference?: string;
        /**
         * ReleaseOperatorDeploy informs the release-operator that it should deploy the component.
         */
        releaseOperatorDeploy?: boolean;
        /**
         * Version of the component.
         */
        version: string;
      },
      ...{
        /**
         * Catalog specifies the name of the app catalog that this component belongs to.
         */
        catalog?: string;
        /**
         * Name of the component.
         */
        name: string;
        /**
         * Reference is the component's version in the catalog (e.g. 1.2.3 or 1.2.3-abc8675309).
         */
        reference?: string;
        /**
         * ReleaseOperatorDeploy informs the release-operator that it should deploy the component.
         */
        releaseOperatorDeploy?: boolean;
        /**
         * Version of the component.
         */
        version: string;
      }[]
    ];
    /**
     * Date that the release became active.
     */
    date: string;
    /**
     * EndOfLifeDate is the date and time when support for a workload cluster using
     * this release ends. This may not be set at the time of release creation
     * and can be specified later.
     */
    endOfLifeDate?: string;
    /**
     * Notice outlines anything worth being aware of in this release.
     */
    notice?: string;
    /**
     * State indicates the availability of the release: deprecated, active, or wip.
     */
    state: string;
  };
  status?: {
    /**
     * InUse indicates whether a release is actually used by a cluster.
     */
    inUse?: boolean;
    /**
     * Ready indicates if all components of the release have been deployed.
     */
    ready?: boolean;
  };
}

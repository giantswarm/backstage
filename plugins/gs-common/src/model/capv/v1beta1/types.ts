/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * VSphereCluster is the Schema for the vsphereclusters API.
 */
export interface IVSphereCluster {
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
  kind: 'VSphereCluster';
  metadata: metav1.IObjectMeta;
  /**
   * VSphereClusterSpec defines the desired state of VSphereCluster.
   */
  spec?: {
    /**
     * ClusterModules hosts information regarding the anti-affinity vSphere constructs
     * for each of the objects responsible for creation of VM objects belonging to the cluster.
     */
    clusterModules?: {
      /**
       * ControlPlane indicates whether the referred object is responsible for control plane nodes.
       * Currently, only the KubeadmControlPlane objects have this flag set to true.
       * Only a single object in the slice can have this value set to true.
       */
      controlPlane: boolean;
      /**
       * ModuleUUID is the unique identifier of the `ClusterModule` used by the object.
       */
      moduleUUID: string;
      /**
       * TargetObjectName points to the object that uses the Cluster Module information to enforce
       * anti-affinity amongst its descendant VM objects.
       */
      targetObjectName: string;
    }[];
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
     * DisableClusterModule is used to explicitly turn off the ClusterModule feature.
     * This should work along side NodeAntiAffinity feature flag.
     * If the NodeAntiAffinity feature flag is turned off, this will be disregarded.
     */
    disableClusterModule?: boolean;
    /**
     * FailureDomainSelector is the label selector to use for failure domain selection
     * for the control plane nodes of the cluster.
     * If not set (`nil`), selecting failure domains will be disabled.
     * An empty value (`{}`) selects all existing failure domains.
     * A valid selector will select all failure domains which match the selector.
     */
    failureDomainSelector?: {
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
     * IdentityRef is a reference to either a Secret or VSphereClusterIdentity that contains
     * the identity to use when reconciling the cluster.
     */
    identityRef?: {
      /**
       * Kind of the identity. Can either be VSphereClusterIdentity or Secret
       */
      kind: 'VSphereClusterIdentity' | 'Secret';
      /**
       * Name of the identity.
       */
      name: string;
    };
    /**
     * Server is the address of the vSphere endpoint.
     */
    server?: string;
    /**
     * Thumbprint is the colon-separated SHA-1 checksum of the given vCenter server's host certificate
     */
    thumbprint?: string;
  };
  /**
   * VSphereClusterStatus defines the observed state of VSphereClusterSpec.
   */
  status?: {
    /**
     * Conditions defines current service state of the VSphereCluster.
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
     * FailureDomains is a list of failure domain objects synced from the infrastructure provider.
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
    ready?: boolean;
    /**
     * VCenterVersion defines the version of the vCenter server defined in the spec.
     */
    vCenterVersion?: string;
  };
}

/**
 * VSphereClusterIdentity defines the account to be used for reconciling clusters.
 */
export interface IVSphereClusterIdentity {
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
  kind: 'VSphereClusterIdentity';
  metadata: metav1.IObjectMeta;
  /**
   * VSphereClusterIdentitySpec contains a secret reference and a group of allowed namespaces.
   */
  spec?: {
    /**
     * AllowedNamespaces is used to identify which namespaces are allowed to use this account.
     * Namespaces can be selected with a label selector.
     * If this object is nil, no namespaces will be allowed
     */
    allowedNamespaces?: {
      /**
       * Selector is a standard Kubernetes LabelSelector. A label query over a set of resources.
       */
      selector?: {
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
    };
    /**
     * SecretName references a Secret inside the controller namespace with the credentials to use
     */
    secretName?: string;
  };
  /**
   * VSphereClusterIdentityStatus contains the status of the VSphereClusterIdentity.
   */
  status?: {
    /**
     * Conditions defines current service state of the VSphereCluster.
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
    ready?: boolean;
  };
}

/**
 * VSphereMachine is the Schema for the vspheremachines API.
 */
export interface IVSphereMachine {
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
  kind: 'VSphereMachine';
  metadata: metav1.IObjectMeta;
  /**
   * VSphereMachineSpec defines the desired state of VSphereMachine.
   */
  spec?: {
    /**
     * AdditionalDisksGiB holds the sizes of additional disks of the virtual machine, in GiB
     * Defaults to the eponymous property value in the template from which the
     * virtual machine is cloned.
     */
    additionalDisksGiB?: number[];
    /**
     * CloneMode specifies the type of clone operation.
     * The LinkedClone mode is only support for templates that have at least
     * one snapshot. If the template has no snapshots, then CloneMode defaults
     * to FullClone.
     * When LinkedClone mode is enabled the DiskGiB field is ignored as it is
     * not possible to expand disks of linked clones.
     * Defaults to LinkedClone, but fails gracefully to FullClone if the source
     * of the clone operation has no snapshots.
     */
    cloneMode?: string;
    /**
     * CustomVMXKeys is a dictionary of advanced VMX options that can be set on VM
     * Defaults to empty map
     */
    customVMXKeys?: {
      [k: string]: string;
    };
    /**
     * DataDisks are additional disks to add to the VM that are not part of the VM's OVA template.
     *
     * @maxItems 29
     */
    dataDisks?: {
      /**
       * Name is used to identify the disk definition. Name is required and needs to be unique so that it can be used to
       * clearly identify purpose of the disk.
       */
      name: string;
      /**
       * ProvisioningMode specifies the provisioning type to be used by this vSphere data disk.
       * If not set, the setting will be provided by the default storage policy.
       */
      provisioningMode?: 'Thin' | 'Thick' | 'EagerlyZeroed';
      /**
       * SizeGiB is the size of the disk in GiB.
       */
      sizeGiB: number;
    }[];
    /**
     * Datacenter is the name, inventory path, managed object reference or the managed
     * object ID of the datacenter in which the virtual machine is created/located.
     * Defaults to * which selects the default datacenter.
     */
    datacenter?: string;
    /**
     * Datastore is the name, inventory path, managed object reference or the managed
     * object ID of the datastore in which the virtual machine is created/located.
     */
    datastore?: string;
    /**
     * DiskGiB is the size of a virtual machine's disk, in GiB.
     * Defaults to the eponymous property value in the template from which the
     * virtual machine is cloned.
     */
    diskGiB?: number;
    /**
     * FailureDomain is the failure domain unique identifier this Machine should be attached to, as defined in Cluster API.
     * For this infrastructure provider, the name is equivalent to the name of the VSphereDeploymentZone.
     */
    failureDomain?: string;
    /**
     * Folder is the name, inventory path, managed object reference or the managed
     * object ID of the folder in which the virtual machine is created/located.
     */
    folder?: string;
    /**
     * GuestSoftPowerOffTimeout sets the wait timeout for shutdown in the VM guest.
     * The VM will be powered off forcibly after the timeout if the VM is still
     * up and running when the PowerOffMode is set to trySoft.
     *
     * This parameter only applies when the PowerOffMode is set to trySoft.
     *
     * If omitted, the timeout defaults to 5 minutes.
     */
    guestSoftPowerOffTimeout?: string;
    /**
     * HardwareVersion is the hardware version of the virtual machine.
     * Defaults to the eponymous property value in the template from which the
     * virtual machine is cloned.
     * Check the compatibility with the ESXi version before setting the value.
     */
    hardwareVersion?: string;
    /**
     * MemoryMiB is the size of a virtual machine's memory, in MiB.
     * Defaults to the eponymous property value in the template from which the
     * virtual machine is cloned.
     */
    memoryMiB?: number;
    /**
     * NamingStrategy allows configuring the naming strategy used when calculating the name of the VSphereVM.
     */
    namingStrategy?: {
      /**
       * Template defines the template to use for generating the name of the VSphereVM object.
       * If not defined, it will fall back to `{{ .machine.name }}`.
       * The templating has the following data available:
       * * `.machine.name`: The name of the Machine object.
       * The templating also has the following funcs available:
       * * `trimSuffix`: same as strings.TrimSuffix
       * * `trunc`: truncates a string, e.g. `trunc 2 "hello"` or `trunc -2 "hello"`
       * Notes:
       * * While the template offers some flexibility, we would like the name to link to the Machine name
       *   to ensure better user experience when troubleshooting
       * * Generated names must be valid Kubernetes names as they are used to create a VSphereVM object
       *   and usually also as the name of the Node object.
       * * Names are automatically truncated at 63 characters. Please note that this can lead to name conflicts,
       *   so we highly recommend to use a template which leads to a name shorter than 63 characters.
       */
      template?: string;
    };
    /**
     * Network is the network configuration for this machine's VM.
     */
    network: {
      /**
       * Devices is the list of network devices used by the virtual machine.
       *
       */
      devices: {
        /**
         * AddressesFromPools is a list of IPAddressPools that should be assigned
         * to IPAddressClaims. The machine's cloud-init metadata will be populated
         * with IPAddresses fulfilled by an IPAM provider.
         */
        addressesFromPools?: {
          /**
           * APIGroup is the group for the resource being referenced.
           * If APIGroup is not specified, the specified Kind must be in the core API group.
           * For any other third-party types, APIGroup is required.
           */
          apiGroup?: string;
          /**
           * Kind is the type of resource being referenced
           */
          kind: string;
          /**
           * Name is the name of resource being referenced
           */
          name: string;
        }[];
        /**
         * DeviceName may be used to explicitly assign a name to the network device
         * as it exists in the guest operating system.
         */
        deviceName?: string;
        /**
         * DHCP4 is a flag that indicates whether or not to use DHCP for IPv4
         * on this device.
         * If true then IPAddrs should not contain any IPv4 addresses.
         */
        dhcp4?: boolean;
        /**
         * DHCP4Overrides allows for the control over several DHCP behaviors.
         * Overrides will only be applied when the corresponding DHCP flag is set.
         * Only configured values will be sent, omitted values will default to
         * distribution defaults.
         * Dependent on support in the network stack for your distribution.
         * For more information see the netplan reference (https://netplan.io/reference#dhcp-overrides)
         */
        dhcp4Overrides?: {
          /**
           * Hostname is the name which will be sent to the DHCP server instead of
           * the machine's hostname.
           */
          hostname?: string;
          /**
           * RouteMetric is used to prioritize routes for devices. A lower metric for
           * an interface will have a higher priority.
           */
          routeMetric?: number;
          /**
           * SendHostname when `true`, the hostname of the machine will be sent to the
           * DHCP server.
           */
          sendHostname?: boolean;
          /**
           * UseDNS when `true`, the DNS servers in the DHCP server will be used and
           * take precedence.
           */
          useDNS?: boolean;
          /**
           * UseDomains can take the values `true`, `false`, or `route`. When `true`,
           * the domain name from the DHCP server will be used as the DNS search
           * domain for this device. When `route`, the domain name from the DHCP
           * response will be used for routing DNS only, not for searching.
           */
          useDomains?: string;
          /**
           * UseHostname when `true`, the hostname from the DHCP server will be set
           * as the transient hostname of the machine.
           */
          useHostname?: boolean;
          /**
           * UseMTU when `true`, the MTU from the DHCP server will be set as the
           * MTU of the device.
           */
          useMTU?: boolean;
          /**
           * UseNTP when `true`, the NTP servers from the DHCP server will be used
           * by systemd-timesyncd and take precedence.
           */
          useNTP?: boolean;
          /**
           * UseRoutes when `true`, the routes from the DHCP server will be installed
           * in the routing table.
           */
          useRoutes?: string;
        };
        /**
         * DHCP6 is a flag that indicates whether or not to use DHCP for IPv6
         * on this device.
         * If true then IPAddrs should not contain any IPv6 addresses.
         */
        dhcp6?: boolean;
        /**
         * DHCP6Overrides allows for the control over several DHCP behaviors.
         * Overrides will only be applied when the corresponding DHCP flag is set.
         * Only configured values will be sent, omitted values will default to
         * distribution defaults.
         * Dependent on support in the network stack for your distribution.
         * For more information see the netplan reference (https://netplan.io/reference#dhcp-overrides)
         */
        dhcp6Overrides?: {
          /**
           * Hostname is the name which will be sent to the DHCP server instead of
           * the machine's hostname.
           */
          hostname?: string;
          /**
           * RouteMetric is used to prioritize routes for devices. A lower metric for
           * an interface will have a higher priority.
           */
          routeMetric?: number;
          /**
           * SendHostname when `true`, the hostname of the machine will be sent to the
           * DHCP server.
           */
          sendHostname?: boolean;
          /**
           * UseDNS when `true`, the DNS servers in the DHCP server will be used and
           * take precedence.
           */
          useDNS?: boolean;
          /**
           * UseDomains can take the values `true`, `false`, or `route`. When `true`,
           * the domain name from the DHCP server will be used as the DNS search
           * domain for this device. When `route`, the domain name from the DHCP
           * response will be used for routing DNS only, not for searching.
           */
          useDomains?: string;
          /**
           * UseHostname when `true`, the hostname from the DHCP server will be set
           * as the transient hostname of the machine.
           */
          useHostname?: boolean;
          /**
           * UseMTU when `true`, the MTU from the DHCP server will be set as the
           * MTU of the device.
           */
          useMTU?: boolean;
          /**
           * UseNTP when `true`, the NTP servers from the DHCP server will be used
           * by systemd-timesyncd and take precedence.
           */
          useNTP?: boolean;
          /**
           * UseRoutes when `true`, the routes from the DHCP server will be installed
           * in the routing table.
           */
          useRoutes?: string;
        };
        /**
         * Gateway4 is the IPv4 gateway used by this device.
         * Required when DHCP4 is false.
         */
        gateway4?: string;
        /**
         * Gateway4 is the IPv4 gateway used by this device.
         */
        gateway6?: string;
        /**
         * IPAddrs is a list of one or more IPv4 and/or IPv6 addresses to assign
         * to this device. IP addresses must also specify the segment length in
         * CIDR notation.
         * Required when DHCP4, DHCP6 and SkipIPAllocation are false.
         */
        ipAddrs?: string[];
        /**
         * MACAddr is the MAC address used by this device.
         * It is generally a good idea to omit this field and allow a MAC address
         * to be generated.
         * Please note that this value must use the VMware OUI to work with the
         * in-tree vSphere cloud provider.
         */
        macAddr?: string;
        /**
         * MTU is the device’s Maximum Transmission Unit size in bytes.
         */
        mtu?: number;
        /**
         * Nameservers is a list of IPv4 and/or IPv6 addresses used as DNS
         * nameservers.
         * Please note that Linux allows only three nameservers (https://linux.die.net/man/5/resolv.conf).
         */
        nameservers?: string[];
        /**
         * NetworkName is the name, managed object reference or the managed
         * object ID of the vSphere network to which the device will be connected.
         */
        networkName: string;
        /**
         * Routes is a list of optional, static routes applied to the device.
         */
        routes?: {
          /**
           * Metric is the weight/priority of the route.
           */
          metric: number;
          /**
           * To is an IPv4 or IPv6 address.
           */
          to: string;
          /**
           * Via is an IPv4 or IPv6 address.
           */
          via: string;
        }[];
        /**
         * SearchDomains is a list of search domains used when resolving IP
         * addresses with DNS.
         */
        searchDomains?: string[];
        /**
         * SkipIPAllocation allows the device to not have IP address or DHCP configured.
         * This is suitable for devices for which IP allocation is handled externally, eg. using Multus CNI.
         * If true, CAPV will not verify IP address allocation.
         */
        skipIPAllocation?: boolean;
      }[];
      /**
       * PreferredAPIServeCIDR is the preferred CIDR for the Kubernetes API
       * server endpoint on this machine
       *
       * Deprecated: This field is going to be removed in a future release.
       */
      preferredAPIServerCidr?: string;
      /**
       * Routes is a list of optional, static routes applied to the virtual
       * machine.
       */
      routes?: {
        /**
         * Metric is the weight/priority of the route.
         */
        metric: number;
        /**
         * To is an IPv4 or IPv6 address.
         */
        to: string;
        /**
         * Via is an IPv4 or IPv6 address.
         */
        via: string;
      }[];
    };
    /**
     * NumCPUs is the number of virtual processors in a virtual machine.
     * Defaults to the eponymous property value in the template from which the
     * virtual machine is cloned.
     */
    numCPUs?: number;
    /**
     * NumCPUs is the number of cores among which to distribute CPUs in this
     * virtual machine.
     * Defaults to the eponymous property value in the template from which the
     * virtual machine is cloned.
     */
    numCoresPerSocket?: number;
    /**
     * OS is the Operating System of the virtual machine
     * Defaults to Linux
     */
    os?: string;
    /**
     * PciDevices is the list of pci devices used by the virtual machine.
     */
    pciDevices?: {
      /**
       * CustomLabel is the hardware label of a virtual machine's PCI device.
       * Defaults to the eponymous property value in the template from which the
       * virtual machine is cloned.
       */
      customLabel?: string;
      /**
       * DeviceID is the device ID of a virtual machine's PCI, in integer.
       * Defaults to the eponymous property value in the template from which the
       * virtual machine is cloned.
       * Mutually exclusive with VGPUProfile as VGPUProfile and DeviceID + VendorID
       * are two independent ways to define PCI devices.
       */
      deviceId?: number;
      /**
       * VGPUProfile is the profile name of a virtual machine's vGPU, in string.
       * Defaults to the eponymous property value in the template from which the
       * virtual machine is cloned.
       * Mutually exclusive with DeviceID and VendorID as VGPUProfile and DeviceID + VendorID
       * are two independent ways to define PCI devices.
       */
      vGPUProfile?: string;
      /**
       * VendorId is the vendor ID of a virtual machine's PCI, in integer.
       * Defaults to the eponymous property value in the template from which the
       * virtual machine is cloned.
       * Mutually exclusive with VGPUProfile as VGPUProfile and DeviceID + VendorID
       * are two independent ways to define PCI devices.
       */
      vendorId?: number;
    }[];
    /**
     * PowerOffMode describes the desired behavior when powering off a VM.
     *
     * There are three, supported power off modes: hard, soft, and
     * trySoft. The first mode, hard, is the equivalent of a physical
     * system's power cord being ripped from the wall. The soft mode
     * requires the VM's guest to have VM Tools installed and attempts to
     * gracefully shut down the VM. Its variant, trySoft, first attempts
     * a graceful shutdown, and if that fails or the VM is not in a powered off
     * state after reaching the GuestSoftPowerOffTimeout, the VM is halted.
     *
     * If omitted, the mode defaults to hard.
     */
    powerOffMode?: 'hard' | 'soft' | 'trySoft';
    /**
     * ProviderID is the virtual machine's BIOS UUID formated as
     * vsphere://12345678-1234-1234-1234-123456789abc
     */
    providerID?: string;
    /**
     * ResourcePool is the name, inventory path, managed object reference or the managed
     * object ID in which the virtual machine is created/located.
     */
    resourcePool?: string;
    /**
     * Server is the IP address or FQDN of the vSphere server on which
     * the virtual machine is created/located.
     */
    server?: string;
    /**
     * Snapshot is the name of the snapshot from which to create a linked clone.
     * This field is ignored if LinkedClone is not enabled.
     * Defaults to the source's current snapshot.
     */
    snapshot?: string;
    /**
     * StoragePolicyName of the storage policy to use with this
     * Virtual Machine
     */
    storagePolicyName?: string;
    /**
     * TagIDs is an optional set of tags to add to an instance. Specified tagIDs
     * must use URN-notation instead of display names.
     */
    tagIDs?: string[];
    /**
     * Template is the name, inventory path, managed object reference or the managed
     * object ID of the template used to clone the virtual machine.
     */
    template: string;
    /**
     * Thumbprint is the colon-separated SHA-1 checksum of the given vCenter server's host certificate
     * When this is set to empty, this VirtualMachine would be created
     * without TLS certificate validation of the communication between Cluster API Provider vSphere
     * and the VMware vCenter server.
     */
    thumbprint?: string;
  };
  /**
   * VSphereMachineStatus defines the observed state of VSphereMachine.
   */
  status?: {
    /**
     * Addresses contains the VSphere instance associated addresses.
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
     * Conditions defines current service state of the VSphereMachine.
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
     * FailureMessage will be set in the event that there is a terminal problem
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
     */
    failureMessage?: string;
    /**
     * FailureReason will be set in the event that there is a terminal problem
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
     */
    failureReason?: string;
    /**
     * Network returns the network status for each of the machine's configured
     * network interfaces.
     */
    network?: {
      /**
       * Connected is a flag that indicates whether this network is currently
       * connected to the VM.
       */
      connected?: boolean;
      /**
       * IPAddrs is one or more IP addresses reported by vm-tools.
       */
      ipAddrs?: string[];
      /**
       * MACAddr is the MAC address of the network device.
       */
      macAddr: string;
      /**
       * NetworkName is the name of the network.
       */
      networkName?: string;
    }[];
    /**
     * Ready is true when the provider resource is ready.
     */
    ready?: boolean;
  };
}

/**
 * VSphereMachineTemplate is the Schema for the vspheremachinetemplates API.
 */
export interface IVSphereMachineTemplate {
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
  kind: 'VSphereMachineTemplate';
  metadata: metav1.IObjectMeta;
  /**
   * VSphereMachineTemplateSpec defines the desired state of VSphereMachineTemplate.
   */
  spec?: {
    /**
     * VSphereMachineTemplateResource describes the data needed to create a VSphereMachine from a template.
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
       * Spec is the specification of the desired behavior of the machine.
       */
      spec: {
        /**
         * AdditionalDisksGiB holds the sizes of additional disks of the virtual machine, in GiB
         * Defaults to the eponymous property value in the template from which the
         * virtual machine is cloned.
         */
        additionalDisksGiB?: number[];
        /**
         * CloneMode specifies the type of clone operation.
         * The LinkedClone mode is only support for templates that have at least
         * one snapshot. If the template has no snapshots, then CloneMode defaults
         * to FullClone.
         * When LinkedClone mode is enabled the DiskGiB field is ignored as it is
         * not possible to expand disks of linked clones.
         * Defaults to LinkedClone, but fails gracefully to FullClone if the source
         * of the clone operation has no snapshots.
         */
        cloneMode?: string;
        /**
         * CustomVMXKeys is a dictionary of advanced VMX options that can be set on VM
         * Defaults to empty map
         */
        customVMXKeys?: {
          [k: string]: string;
        };
        /**
         * DataDisks are additional disks to add to the VM that are not part of the VM's OVA template.
         *
         * @maxItems 29
         */
        dataDisks?: {
          /**
           * Name is used to identify the disk definition. Name is required and needs to be unique so that it can be used to
           * clearly identify purpose of the disk.
           */
          name: string;
          /**
           * ProvisioningMode specifies the provisioning type to be used by this vSphere data disk.
           * If not set, the setting will be provided by the default storage policy.
           */
          provisioningMode?: 'Thin' | 'Thick' | 'EagerlyZeroed';
          /**
           * SizeGiB is the size of the disk in GiB.
           */
          sizeGiB: number;
        }[];
        /**
         * Datacenter is the name, inventory path, managed object reference or the managed
         * object ID of the datacenter in which the virtual machine is created/located.
         * Defaults to * which selects the default datacenter.
         */
        datacenter?: string;
        /**
         * Datastore is the name, inventory path, managed object reference or the managed
         * object ID of the datastore in which the virtual machine is created/located.
         */
        datastore?: string;
        /**
         * DiskGiB is the size of a virtual machine's disk, in GiB.
         * Defaults to the eponymous property value in the template from which the
         * virtual machine is cloned.
         */
        diskGiB?: number;
        /**
         * FailureDomain is the failure domain unique identifier this Machine should be attached to, as defined in Cluster API.
         * For this infrastructure provider, the name is equivalent to the name of the VSphereDeploymentZone.
         */
        failureDomain?: string;
        /**
         * Folder is the name, inventory path, managed object reference or the managed
         * object ID of the folder in which the virtual machine is created/located.
         */
        folder?: string;
        /**
         * GuestSoftPowerOffTimeout sets the wait timeout for shutdown in the VM guest.
         * The VM will be powered off forcibly after the timeout if the VM is still
         * up and running when the PowerOffMode is set to trySoft.
         *
         * This parameter only applies when the PowerOffMode is set to trySoft.
         *
         * If omitted, the timeout defaults to 5 minutes.
         */
        guestSoftPowerOffTimeout?: string;
        /**
         * HardwareVersion is the hardware version of the virtual machine.
         * Defaults to the eponymous property value in the template from which the
         * virtual machine is cloned.
         * Check the compatibility with the ESXi version before setting the value.
         */
        hardwareVersion?: string;
        /**
         * MemoryMiB is the size of a virtual machine's memory, in MiB.
         * Defaults to the eponymous property value in the template from which the
         * virtual machine is cloned.
         */
        memoryMiB?: number;
        /**
         * NamingStrategy allows configuring the naming strategy used when calculating the name of the VSphereVM.
         */
        namingStrategy?: {
          /**
           * Template defines the template to use for generating the name of the VSphereVM object.
           * If not defined, it will fall back to `{{ .machine.name }}`.
           * The templating has the following data available:
           * * `.machine.name`: The name of the Machine object.
           * The templating also has the following funcs available:
           * * `trimSuffix`: same as strings.TrimSuffix
           * * `trunc`: truncates a string, e.g. `trunc 2 "hello"` or `trunc -2 "hello"`
           * Notes:
           * * While the template offers some flexibility, we would like the name to link to the Machine name
           *   to ensure better user experience when troubleshooting
           * * Generated names must be valid Kubernetes names as they are used to create a VSphereVM object
           *   and usually also as the name of the Node object.
           * * Names are automatically truncated at 63 characters. Please note that this can lead to name conflicts,
           *   so we highly recommend to use a template which leads to a name shorter than 63 characters.
           */
          template?: string;
        };
        /**
         * Network is the network configuration for this machine's VM.
         */
        network: {
          /**
           * Devices is the list of network devices used by the virtual machine.
           *
           */
          devices: {
            /**
             * AddressesFromPools is a list of IPAddressPools that should be assigned
             * to IPAddressClaims. The machine's cloud-init metadata will be populated
             * with IPAddresses fulfilled by an IPAM provider.
             */
            addressesFromPools?: {
              /**
               * APIGroup is the group for the resource being referenced.
               * If APIGroup is not specified, the specified Kind must be in the core API group.
               * For any other third-party types, APIGroup is required.
               */
              apiGroup?: string;
              /**
               * Kind is the type of resource being referenced
               */
              kind: string;
              /**
               * Name is the name of resource being referenced
               */
              name: string;
            }[];
            /**
             * DeviceName may be used to explicitly assign a name to the network device
             * as it exists in the guest operating system.
             */
            deviceName?: string;
            /**
             * DHCP4 is a flag that indicates whether or not to use DHCP for IPv4
             * on this device.
             * If true then IPAddrs should not contain any IPv4 addresses.
             */
            dhcp4?: boolean;
            /**
             * DHCP4Overrides allows for the control over several DHCP behaviors.
             * Overrides will only be applied when the corresponding DHCP flag is set.
             * Only configured values will be sent, omitted values will default to
             * distribution defaults.
             * Dependent on support in the network stack for your distribution.
             * For more information see the netplan reference (https://netplan.io/reference#dhcp-overrides)
             */
            dhcp4Overrides?: {
              /**
               * Hostname is the name which will be sent to the DHCP server instead of
               * the machine's hostname.
               */
              hostname?: string;
              /**
               * RouteMetric is used to prioritize routes for devices. A lower metric for
               * an interface will have a higher priority.
               */
              routeMetric?: number;
              /**
               * SendHostname when `true`, the hostname of the machine will be sent to the
               * DHCP server.
               */
              sendHostname?: boolean;
              /**
               * UseDNS when `true`, the DNS servers in the DHCP server will be used and
               * take precedence.
               */
              useDNS?: boolean;
              /**
               * UseDomains can take the values `true`, `false`, or `route`. When `true`,
               * the domain name from the DHCP server will be used as the DNS search
               * domain for this device. When `route`, the domain name from the DHCP
               * response will be used for routing DNS only, not for searching.
               */
              useDomains?: string;
              /**
               * UseHostname when `true`, the hostname from the DHCP server will be set
               * as the transient hostname of the machine.
               */
              useHostname?: boolean;
              /**
               * UseMTU when `true`, the MTU from the DHCP server will be set as the
               * MTU of the device.
               */
              useMTU?: boolean;
              /**
               * UseNTP when `true`, the NTP servers from the DHCP server will be used
               * by systemd-timesyncd and take precedence.
               */
              useNTP?: boolean;
              /**
               * UseRoutes when `true`, the routes from the DHCP server will be installed
               * in the routing table.
               */
              useRoutes?: string;
            };
            /**
             * DHCP6 is a flag that indicates whether or not to use DHCP for IPv6
             * on this device.
             * If true then IPAddrs should not contain any IPv6 addresses.
             */
            dhcp6?: boolean;
            /**
             * DHCP6Overrides allows for the control over several DHCP behaviors.
             * Overrides will only be applied when the corresponding DHCP flag is set.
             * Only configured values will be sent, omitted values will default to
             * distribution defaults.
             * Dependent on support in the network stack for your distribution.
             * For more information see the netplan reference (https://netplan.io/reference#dhcp-overrides)
             */
            dhcp6Overrides?: {
              /**
               * Hostname is the name which will be sent to the DHCP server instead of
               * the machine's hostname.
               */
              hostname?: string;
              /**
               * RouteMetric is used to prioritize routes for devices. A lower metric for
               * an interface will have a higher priority.
               */
              routeMetric?: number;
              /**
               * SendHostname when `true`, the hostname of the machine will be sent to the
               * DHCP server.
               */
              sendHostname?: boolean;
              /**
               * UseDNS when `true`, the DNS servers in the DHCP server will be used and
               * take precedence.
               */
              useDNS?: boolean;
              /**
               * UseDomains can take the values `true`, `false`, or `route`. When `true`,
               * the domain name from the DHCP server will be used as the DNS search
               * domain for this device. When `route`, the domain name from the DHCP
               * response will be used for routing DNS only, not for searching.
               */
              useDomains?: string;
              /**
               * UseHostname when `true`, the hostname from the DHCP server will be set
               * as the transient hostname of the machine.
               */
              useHostname?: boolean;
              /**
               * UseMTU when `true`, the MTU from the DHCP server will be set as the
               * MTU of the device.
               */
              useMTU?: boolean;
              /**
               * UseNTP when `true`, the NTP servers from the DHCP server will be used
               * by systemd-timesyncd and take precedence.
               */
              useNTP?: boolean;
              /**
               * UseRoutes when `true`, the routes from the DHCP server will be installed
               * in the routing table.
               */
              useRoutes?: string;
            };
            /**
             * Gateway4 is the IPv4 gateway used by this device.
             * Required when DHCP4 is false.
             */
            gateway4?: string;
            /**
             * Gateway4 is the IPv4 gateway used by this device.
             */
            gateway6?: string;
            /**
             * IPAddrs is a list of one or more IPv4 and/or IPv6 addresses to assign
             * to this device. IP addresses must also specify the segment length in
             * CIDR notation.
             * Required when DHCP4, DHCP6 and SkipIPAllocation are false.
             */
            ipAddrs?: string[];
            /**
             * MACAddr is the MAC address used by this device.
             * It is generally a good idea to omit this field and allow a MAC address
             * to be generated.
             * Please note that this value must use the VMware OUI to work with the
             * in-tree vSphere cloud provider.
             */
            macAddr?: string;
            /**
             * MTU is the device’s Maximum Transmission Unit size in bytes.
             */
            mtu?: number;
            /**
             * Nameservers is a list of IPv4 and/or IPv6 addresses used as DNS
             * nameservers.
             * Please note that Linux allows only three nameservers (https://linux.die.net/man/5/resolv.conf).
             */
            nameservers?: string[];
            /**
             * NetworkName is the name, managed object reference or the managed
             * object ID of the vSphere network to which the device will be connected.
             */
            networkName: string;
            /**
             * Routes is a list of optional, static routes applied to the device.
             */
            routes?: {
              /**
               * Metric is the weight/priority of the route.
               */
              metric: number;
              /**
               * To is an IPv4 or IPv6 address.
               */
              to: string;
              /**
               * Via is an IPv4 or IPv6 address.
               */
              via: string;
            }[];
            /**
             * SearchDomains is a list of search domains used when resolving IP
             * addresses with DNS.
             */
            searchDomains?: string[];
            /**
             * SkipIPAllocation allows the device to not have IP address or DHCP configured.
             * This is suitable for devices for which IP allocation is handled externally, eg. using Multus CNI.
             * If true, CAPV will not verify IP address allocation.
             */
            skipIPAllocation?: boolean;
          }[];
          /**
           * PreferredAPIServeCIDR is the preferred CIDR for the Kubernetes API
           * server endpoint on this machine
           *
           * Deprecated: This field is going to be removed in a future release.
           */
          preferredAPIServerCidr?: string;
          /**
           * Routes is a list of optional, static routes applied to the virtual
           * machine.
           */
          routes?: {
            /**
             * Metric is the weight/priority of the route.
             */
            metric: number;
            /**
             * To is an IPv4 or IPv6 address.
             */
            to: string;
            /**
             * Via is an IPv4 or IPv6 address.
             */
            via: string;
          }[];
        };
        /**
         * NumCPUs is the number of virtual processors in a virtual machine.
         * Defaults to the eponymous property value in the template from which the
         * virtual machine is cloned.
         */
        numCPUs?: number;
        /**
         * NumCPUs is the number of cores among which to distribute CPUs in this
         * virtual machine.
         * Defaults to the eponymous property value in the template from which the
         * virtual machine is cloned.
         */
        numCoresPerSocket?: number;
        /**
         * OS is the Operating System of the virtual machine
         * Defaults to Linux
         */
        os?: string;
        /**
         * PciDevices is the list of pci devices used by the virtual machine.
         */
        pciDevices?: {
          /**
           * CustomLabel is the hardware label of a virtual machine's PCI device.
           * Defaults to the eponymous property value in the template from which the
           * virtual machine is cloned.
           */
          customLabel?: string;
          /**
           * DeviceID is the device ID of a virtual machine's PCI, in integer.
           * Defaults to the eponymous property value in the template from which the
           * virtual machine is cloned.
           * Mutually exclusive with VGPUProfile as VGPUProfile and DeviceID + VendorID
           * are two independent ways to define PCI devices.
           */
          deviceId?: number;
          /**
           * VGPUProfile is the profile name of a virtual machine's vGPU, in string.
           * Defaults to the eponymous property value in the template from which the
           * virtual machine is cloned.
           * Mutually exclusive with DeviceID and VendorID as VGPUProfile and DeviceID + VendorID
           * are two independent ways to define PCI devices.
           */
          vGPUProfile?: string;
          /**
           * VendorId is the vendor ID of a virtual machine's PCI, in integer.
           * Defaults to the eponymous property value in the template from which the
           * virtual machine is cloned.
           * Mutually exclusive with VGPUProfile as VGPUProfile and DeviceID + VendorID
           * are two independent ways to define PCI devices.
           */
          vendorId?: number;
        }[];
        /**
         * PowerOffMode describes the desired behavior when powering off a VM.
         *
         * There are three, supported power off modes: hard, soft, and
         * trySoft. The first mode, hard, is the equivalent of a physical
         * system's power cord being ripped from the wall. The soft mode
         * requires the VM's guest to have VM Tools installed and attempts to
         * gracefully shut down the VM. Its variant, trySoft, first attempts
         * a graceful shutdown, and if that fails or the VM is not in a powered off
         * state after reaching the GuestSoftPowerOffTimeout, the VM is halted.
         *
         * If omitted, the mode defaults to hard.
         */
        powerOffMode?: 'hard' | 'soft' | 'trySoft';
        /**
         * ProviderID is the virtual machine's BIOS UUID formated as
         * vsphere://12345678-1234-1234-1234-123456789abc
         */
        providerID?: string;
        /**
         * ResourcePool is the name, inventory path, managed object reference or the managed
         * object ID in which the virtual machine is created/located.
         */
        resourcePool?: string;
        /**
         * Server is the IP address or FQDN of the vSphere server on which
         * the virtual machine is created/located.
         */
        server?: string;
        /**
         * Snapshot is the name of the snapshot from which to create a linked clone.
         * This field is ignored if LinkedClone is not enabled.
         * Defaults to the source's current snapshot.
         */
        snapshot?: string;
        /**
         * StoragePolicyName of the storage policy to use with this
         * Virtual Machine
         */
        storagePolicyName?: string;
        /**
         * TagIDs is an optional set of tags to add to an instance. Specified tagIDs
         * must use URN-notation instead of display names.
         */
        tagIDs?: string[];
        /**
         * Template is the name, inventory path, managed object reference or the managed
         * object ID of the template used to clone the virtual machine.
         */
        template: string;
        /**
         * Thumbprint is the colon-separated SHA-1 checksum of the given vCenter server's host certificate
         * When this is set to empty, this VirtualMachine would be created
         * without TLS certificate validation of the communication between Cluster API Provider vSphere
         * and the VMware vCenter server.
         */
        thumbprint?: string;
      };
    };
  };
}

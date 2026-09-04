import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type KarpenterMachinePoolInterface =
  crds.giantswarm.v1alpha1.KarpenterMachinePool;

type KarpenterSpec = NonNullable<KarpenterMachinePoolInterface['spec']>;

/**
 * The Karpenter `NodePool` spec, inlined into this CR rather than referenced.
 */
export type KarpenterNodePoolSpec = NonNullable<KarpenterSpec['nodePool']>;

/**
 * The Karpenter `EC2NodeClass` spec, co-specified in this CR, which is why
 * there is no `nodeClassRef` to resolve.
 */
export type KarpenterEC2NodeClassSpec = NonNullable<
  KarpenterSpec['ec2NodeClass']
>;

export type KarpenterNodeRequirement =
  KarpenterNodePoolSpec['template']['spec']['requirements'][number];

export type KarpenterDisruption = NonNullable<
  KarpenterNodePoolSpec['disruption']
>;

export type KarpenterDisruptionBudget = NonNullable<
  KarpenterDisruption['budgets']
>[number];

export type KarpenterTaint = NonNullable<
  KarpenterNodePoolSpec['template']['spec']['taints']
>[number];

export type KarpenterAmiFamily = NonNullable<
  KarpenterEC2NodeClassSpec['amiFamily']
>;

export type KarpenterAmiSelectorTerm =
  KarpenterEC2NodeClassSpec['amiSelectorTerms'][number];

export type KarpenterBlockDeviceMapping = NonNullable<
  KarpenterEC2NodeClassSpec['blockDeviceMappings']
>[number];

export type KarpenterInstanceStorePolicy = NonNullable<
  KarpenterEC2NodeClassSpec['instanceStorePolicy']
>;

export type KarpenterKubeletConfig = NonNullable<
  KarpenterEC2NodeClassSpec['kubelet']
>;

export type KarpenterMetadataOptions = NonNullable<
  KarpenterEC2NodeClassSpec['metadataOptions']
>;

export class KarpenterMachinePool extends KubeObject<KarpenterMachinePoolInterface> {
  static readonly supportedVersions = ['v1alpha1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'KarpenterMachinePool' as const;
  static readonly plural = 'karpentermachinepools';

  getReplicas(): number | undefined {
    return this.jsonData.status?.replicas;
  }

  isReady(): boolean {
    return this.jsonData.status?.ready === true;
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  getNodePoolSpec(): KarpenterNodePoolSpec | undefined {
    return this.jsonData.spec?.nodePool;
  }

  getEC2NodeClassSpec(): KarpenterEC2NodeClassSpec | undefined {
    return this.jsonData.spec?.ec2NodeClass;
  }

  /**
   * Node IDs of the instances backing this pool. Usable as a node count even
   * when metrics are unavailable.
   */
  getProviderIDs(): string[] {
    return this.jsonData.spec?.providerIDList ?? [];
  }

  /**
   * Scheduling constraints applied to every node of this pool. Requirements on
   * the same key intersect, so callers must group by key rather than treat each
   * entry as an alternative.
   */
  getRequirements(): KarpenterNodeRequirement[] {
    return this.jsonData.spec?.nodePool?.template?.spec?.requirements ?? [];
  }

  getLimits(): Record<string, number | string> | undefined {
    return this.jsonData.spec?.nodePool?.limits;
  }

  getWeight(): number | undefined {
    return this.jsonData.spec?.nodePool?.weight;
  }

  getDisruption(): KarpenterDisruption | undefined {
    return this.jsonData.spec?.nodePool?.disruption;
  }

  getConsolidationPolicy():
    'WhenEmpty' | 'WhenEmptyOrUnderutilized' | undefined {
    return this.jsonData.spec?.nodePool?.disruption?.consolidationPolicy;
  }

  getConsolidateAfter(): string | undefined {
    return this.jsonData.spec?.nodePool?.disruption?.consolidateAfter;
  }

  getDisruptionBudgets(): KarpenterDisruptionBudget[] {
    return this.jsonData.spec?.nodePool?.disruption?.budgets ?? [];
  }

  getExpireAfter(): string | undefined {
    return this.jsonData.spec?.nodePool?.template?.spec?.expireAfter;
  }

  getTerminationGracePeriod(): string | undefined {
    return this.jsonData.spec?.nodePool?.template?.spec?.terminationGracePeriod;
  }

  getTaints(): KarpenterTaint[] {
    return this.jsonData.spec?.nodePool?.template?.spec?.taints ?? [];
  }

  getStartupTaints(): KarpenterTaint[] {
    return this.jsonData.spec?.nodePool?.template?.spec?.startupTaints ?? [];
  }

  getNodeLabels(): Record<string, string> | undefined {
    return this.jsonData.spec?.nodePool?.template?.metadata?.labels;
  }

  getNodeAnnotations(): Record<string, string> | undefined {
    return this.jsonData.spec?.nodePool?.template?.metadata?.annotations;
  }

  getAmiFamily(): KarpenterAmiFamily | undefined {
    return this.jsonData.spec?.ec2NodeClass?.amiFamily;
  }

  getAmiSelectorTerms(): KarpenterAmiSelectorTerm[] {
    return this.jsonData.spec?.ec2NodeClass?.amiSelectorTerms ?? [];
  }

  getAmiAliases(): string[] {
    return this.getAmiSelectorTerms()
      .map(term => term.alias)
      .filter((alias): alias is string => Boolean(alias));
  }

  getBlockDeviceMappings(): KarpenterBlockDeviceMapping[] {
    return this.jsonData.spec?.ec2NodeClass?.blockDeviceMappings ?? [];
  }

  /**
   * The mapping explicitly flagged as the root volume, falling back to the
   * first mapping, which is what Karpenter itself treats as root when the flag
   * is omitted.
   */
  getRootVolume(): KarpenterBlockDeviceMapping | undefined {
    const mappings = this.getBlockDeviceMappings();
    return mappings.find(mapping => mapping.rootVolume === true) ?? mappings[0];
  }

  getInstanceStorePolicy(): KarpenterInstanceStorePolicy | undefined {
    return this.jsonData.spec?.ec2NodeClass?.instanceStorePolicy;
  }

  getDetailedMonitoring(): boolean | undefined {
    return this.jsonData.spec?.ec2NodeClass?.detailedMonitoring;
  }

  getKubeletConfig(): KarpenterKubeletConfig | undefined {
    return this.jsonData.spec?.ec2NodeClass?.kubelet;
  }

  getMetadataOptions(): KarpenterMetadataOptions | undefined {
    return this.jsonData.spec?.ec2NodeClass?.metadataOptions;
  }

  getEc2Tags(): Record<string, string> | undefined {
    return this.jsonData.spec?.ec2NodeClass?.tags;
  }

  getIamRole(): string | undefined {
    return this.jsonData.spec?.ec2NodeClass?.role;
  }

  getInstanceProfile(): string | undefined {
    return this.jsonData.spec?.ec2NodeClass?.instanceProfile;
  }
}

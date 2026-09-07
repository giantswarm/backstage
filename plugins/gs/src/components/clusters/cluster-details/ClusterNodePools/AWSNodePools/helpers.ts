import {
  AWSMachinePool,
  KarpenterMachinePool,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export type AWSNodePoolType = 'ASG' | 'Karpenter';

export type ResolvedAWSNodePoolInfra = {
  type: AWSNodePoolType;
  awsMachinePool: AWSMachinePool | undefined;
  karpenterMachinePool: KarpenterMachinePool | undefined;
};

/**
 * Match a MachinePool to the infrastructure CR it points at.
 *
 * The infra CRs are fetched namespace-wide rather than by cluster label, so
 * they are matched here by the name on the pool's `infrastructureRef`.
 */
export function resolveAWSNodePoolInfra(
  pool: MachinePool,
  awsMachinePools: AWSMachinePool[],
  karpenterMachinePools: KarpenterMachinePool[],
): ResolvedAWSNodePoolInfra {
  const infraRef = pool.getInfrastructureRef();
  const infraKind = infraRef?.kind;
  const infraName = infraRef?.name;

  if (infraKind === KarpenterMachinePool.kind && infraName) {
    return {
      type: 'Karpenter',
      awsMachinePool: undefined,
      karpenterMachinePool: karpenterMachinePools.find(
        p => p.getName() === infraName,
      ),
    };
  }

  if (infraKind === AWSMachinePool.kind && infraName) {
    return {
      type: 'ASG',
      awsMachinePool: awsMachinePools.find(p => p.getName() === infraName),
      karpenterMachinePool: undefined,
    };
  }

  return {
    type: 'ASG',
    awsMachinePool: undefined,
    karpenterMachinePool: undefined,
  };
}

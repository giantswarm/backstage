import {
  AWSMachinePool,
  KarpenterMachinePool,
  KubeObject,
  MachineDeployment,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findResourceByRef } from '../../utils/findResourceByRef';
import {
  MachineSize,
  MachineTypeCatalog,
  MachineTypeInfo,
  describeMachineType,
} from './machineTypes';

/** What worker capacity needs to know about a node pool. */
export type NodePoolCapacityInput = {
  name: string;
  readyReplicas: number | undefined;
  /** Undefined when the pool's machines have no fixed, known size. */
  machineSize: MachineSize | undefined;
};

type NodePoolRowBase = NodePoolCapacityInput & {
  id: string;
  desiredReplicas: number | undefined;
  /** E.g. "4 vCPUs · 16 GiB RAM", for the machine type's tooltip. */
  machineTypeDescription: string | undefined;
  phase: string | undefined;
  created: string | undefined;
};

export type AWSNodePoolType = 'ASG' | 'Karpenter';

export type AWSNodePoolRow = NodePoolRowBase & {
  type: AWSNodePoolType;
  instanceType: string | undefined;
  availabilityZones: string[] | undefined;
  minSize: number | undefined;
  maxSize: number | undefined;
  limits: Record<string, number | string> | undefined;
};

export type NodePoolRow<T extends KubeObject> = NodePoolRowBase & {
  /** The CR the pool's infrastructureRef points at. */
  infrastructure: T | undefined;
  machineType: string | undefined;
};

export type ResolvedAWSNodePoolInfra = {
  type: AWSNodePoolType;
  awsMachinePool: AWSMachinePool | undefined;
  karpenterMachinePool: KarpenterMachinePool | undefined;
};

function findInfrastructure<T extends KubeObject>(
  pool: MachinePool | MachineDeployment,
  candidates: T[],
): T | undefined {
  const infraRef = pool.getInfrastructureRef();
  if (!infraRef) {
    return undefined;
  }

  return (
    findResourceByRef(candidates, {
      installationName: pool.cluster,
      namespace: pool.getNamespace(),
      ...infraRef,
    }) ?? undefined
  );
}

/** Match a MachinePool to the AWS infrastructure CR it points at. */
export function resolveAWSNodePoolInfra(
  pool: MachinePool,
  awsMachinePools: AWSMachinePool[],
  karpenterMachinePools: KarpenterMachinePool[],
): ResolvedAWSNodePoolInfra {
  if (pool.getInfrastructureRef()?.kind === KarpenterMachinePool.kind) {
    return {
      type: 'Karpenter',
      awsMachinePool: undefined,
      karpenterMachinePool: findInfrastructure(pool, karpenterMachinePools),
    };
  }

  return {
    type: 'ASG',
    awsMachinePool: findInfrastructure(pool, awsMachinePools),
    karpenterMachinePool: undefined,
  };
}

export function buildAWSNodePoolRows(
  machinePools: MachinePool[],
  awsMachinePools: AWSMachinePool[],
  karpenterMachinePools: KarpenterMachinePool[],
  catalog: MachineTypeCatalog | undefined,
): AWSNodePoolRow[] {
  return machinePools.map(pool => {
    const { type, awsMachinePool, karpenterMachinePool } =
      resolveAWSNodePoolInfra(pool, awsMachinePools, karpenterMachinePools);
    const instanceType = awsMachinePool?.getInstanceType();
    const instanceTypeInfo = instanceType ? catalog?.(instanceType) : undefined;

    return {
      id: pool.getName(),
      name: pool.getName(),
      type,
      desiredReplicas: pool.getDesiredReplicas(),
      readyReplicas: pool.getReadyReplicas(),
      instanceType,
      machineSize: instanceTypeInfo?.size,
      machineTypeDescription: describeMachineType(instanceTypeInfo),
      availabilityZones: awsMachinePool?.getAvailabilityZones(),
      minSize: awsMachinePool?.getMinSize(),
      maxSize: awsMachinePool?.getMaxSize(),
      // `undefined` means the CR was not read; `{}` means it sets no
      // limits. `getLimits()` collapses both to `undefined`, so the
      // distinction has to be made here, where we still know whether the CR
      // itself came back.
      limits: karpenterMachinePool
        ? (karpenterMachinePool.getLimits() ?? {})
        : undefined,
      phase: pool.getPhase(),
      created: pool.getCreatedTimestamp(),
    };
  });
}

/**
 * Rows for node pools whose machine type is in the infrastructure CR they
 * point at: a machine template (Azure, vSphere, VCD) or an AKS agent pool.
 * `describe` reads the machine type and size off that CR; pools without one,
 * or whose provider has none, get neither.
 */
export function buildNodePoolRows<T extends KubeObject>(
  pools: (MachineDeployment | MachinePool)[],
  infrastructures: T[],
  describe: (template: T) => {
    machineType?: string;
    info?: MachineTypeInfo;
  },
): NodePoolRow<T>[] {
  return pools.map(pool => {
    const infrastructure = findInfrastructure(pool, infrastructures);
    const { machineType, info } = infrastructure
      ? describe(infrastructure)
      : {};

    return {
      id: pool.getName(),
      name: pool.getName(),
      desiredReplicas: pool.getDesiredReplicas(),
      readyReplicas: pool.getReadyReplicas(),
      infrastructure,
      machineType,
      machineSize: info?.size,
      machineTypeDescription: describeMachineType(info),
      phase: pool.getPhase(),
      created: pool.getCreatedTimestamp(),
    };
  });
}

import { useEffect, useState } from 'react';

export type AwsInstanceTypeData = Record<
  string,
  {
    VCpuInfo?: { DefaultVCpus?: number };
    MemoryInfo?: { SizeInMiB?: number };
    ProcessorInfo?: { SupportedArchitectures?: string[] };
  }
>;

let instanceTypeData: AwsInstanceTypeData | undefined;
let dataPromise: Promise<AwsInstanceTypeData> | undefined;

/**
 * Load the bundled instance-type dataset once, shared across callers.
 *
 * The dataset is several megabytes, so it stays a lazy chunk and must not be
 * held in react-query: the app's `PersistQueryClientProvider` dehydrates
 * successful queries into `localStorage`, where this would exhaust the quota
 * and break query persistence app-wide.
 */
export function loadAwsInstanceTypes(): Promise<AwsInstanceTypeData> {
  if (!dataPromise) {
    dataPromise = import('./data/awsInstanceTypes.json').then(m => {
      instanceTypeData = m.default as AwsInstanceTypeData;
      return instanceTypeData;
    });
  }
  return dataPromise;
}

// Start loading eagerly, so the common case is resolved before first paint.
loadAwsInstanceTypes();

/**
 * Subscribe to the instance-type dataset, re-rendering once it resolves.
 *
 * The plain accessors below read a module variable and cannot schedule a
 * re-render, so a component that renders before the chunk arrives would show
 * nothing until an unrelated update. Components that need the data on first
 * paint should use this hook.
 */
export function useAwsInstanceTypes(): AwsInstanceTypeData | undefined {
  const [data, setData] = useState(instanceTypeData);

  useEffect(() => {
    if (data) {
      return undefined;
    }

    let active = true;
    loadAwsInstanceTypes().then(loaded => {
      if (active) {
        setData(loaded);
      }
    });

    return () => {
      active = false;
    };
  }, [data]);

  return data;
}

/**
 * Architectures an instance type supports, e.g. `['arm64']` for Graviton.
 * Pass `data` from `useAwsInstanceTypes()` to be robust on first render.
 */
export function getInstanceTypeArchitectures(
  instanceType: string,
  data?: AwsInstanceTypeData,
): string[] | undefined {
  const source = data ?? instanceTypeData;
  const architectures =
    source?.[instanceType]?.ProcessorInfo?.SupportedArchitectures;

  return architectures?.length ? architectures : undefined;
}

export function getInstanceTypeTooltip(
  instanceType: string,
): string | undefined {
  if (!instanceTypeData) return undefined;

  const info = instanceTypeData[instanceType];
  if (!info) return undefined;

  const parts: string[] = [];
  const vcpus = info.VCpuInfo?.DefaultVCpus;
  if (vcpus !== undefined) parts.push(`${vcpus} vCPUs`);

  const memMiB = info.MemoryInfo?.SizeInMiB;
  if (memMiB !== undefined) {
    const memGiB = memMiB / 1024;
    parts.push(`${memGiB % 1 === 0 ? memGiB : memGiB.toFixed(1)} GiB RAM`);
  }

  const arch = info.ProcessorInfo?.SupportedArchitectures;
  if (arch?.length) parts.push(arch.join(', '));

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

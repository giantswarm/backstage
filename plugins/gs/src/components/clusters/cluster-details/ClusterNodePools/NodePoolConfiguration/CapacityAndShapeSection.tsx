import { Flex, Text } from '@backstage/ui';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { type KarpenterNodePoolStatus } from '../../../../hooks';
import {
  ARCH_KEY,
  CAPACITY_TYPE_KEY,
  findRequirementEntry,
  INSTANCE_FAMILY_KEY,
  INSTANCE_TYPE_KEY,
  parseRequirements,
  type RequirementEntry,
  ZONE_KEY,
} from '../karpenter';
import { AllowedVsRunning } from './AllowedVsRunning';
import { ConfigRow } from './ConfigRow';
import { ConstraintValues } from './ConstraintValues';

/** Keys given a dedicated allowed-vs-running row above the generic list. */
const HIGHLIGHTED_KEYS = [
  CAPACITY_TYPE_KEY,
  ARCH_KEY,
  INSTANCE_FAMILY_KEY,
  INSTANCE_TYPE_KEY,
  ZONE_KEY,
];

interface CapacityAndShapeSectionProps {
  pool: KarpenterMachinePool;
  status: KarpenterNodePoolStatus | undefined;
}

export const CapacityAndShapeSection = ({
  pool,
  status,
}: CapacityAndShapeSectionProps) => {
  const entries = parseRequirements(pool.getRequirements());

  const allowedFor = (key: string) => {
    const entry = findRequirementEntry(entries, key);
    return entry ? <ConstraintValues entry={entry} /> : undefined;
  };

  const remaining: RequirementEntry[] = entries.filter(
    entry => !HIGHLIGHTED_KEYS.includes(entry.key),
  );

  return (
    <InfoCard title="Capacity and instance shape">
      <Flex direction="column" gap="4">
        <AllowedVsRunning
          label="Capacity type"
          allowed={allowedFor(CAPACITY_TYPE_KEY)}
          running={status?.capacityTypes}
        />
        <AllowedVsRunning
          label="Architecture"
          allowed={allowedFor(ARCH_KEY)}
          running={status?.architectures}
        />
        <AllowedVsRunning
          label="Instance families"
          allowed={allowedFor(INSTANCE_FAMILY_KEY)}
          running={status?.instanceFamilies}
        />
        <AllowedVsRunning
          label="Instance types"
          allowed={allowedFor(INSTANCE_TYPE_KEY)}
          running={status?.instanceTypes}
        />
        <AllowedVsRunning
          label="Availability zones"
          allowed={allowedFor(ZONE_KEY)}
          running={status?.zones}
        />

        {remaining.length > 0 && (
          <Flex direction="column" gap="3">
            <Text variant="body-medium" weight="bold">
              Other requirements
            </Text>
            {remaining.map(entry => (
              <ConfigRow key={entry.key} label={entry.label}>
                <ConstraintValues entry={entry} />
              </ConfigRow>
            ))}
          </Flex>
        )}

        {entries.length === 0 && (
          <Text variant="body-medium" color="secondary">
            No requirements set — any instance type is allowed.
          </Text>
        )}
      </Flex>
    </InfoCard>
  );
};

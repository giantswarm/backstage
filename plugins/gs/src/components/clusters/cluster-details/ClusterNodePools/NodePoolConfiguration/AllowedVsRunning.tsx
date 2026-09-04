import { type ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { type MixEntry } from '../../../../hooks';
import { ConfigRow } from './ConfigRow';
import { MixSummary } from './MixSummary';

interface AllowedVsRunningProps {
  label: string;
  /** What the configuration permits. `undefined` renders as unconstrained. */
  allowed: ReactNode;
  /**
   * What is running now. `undefined` omits the line entirely rather than
   * showing a zero, because absent metrics are not the same as no nodes.
   */
  running: MixEntry[] | undefined;
}

export const AllowedVsRunning = ({
  label,
  allowed,
  running,
}: AllowedVsRunningProps) => {
  return (
    <ConfigRow label={label}>
      <Flex direction="column" gap="1">
        <Flex direction="column" gap="0.5">
          <Text variant="body-small" color="secondary">
            Allowed
          </Text>
          {allowed ?? (
            <Text variant="body-medium" color="secondary">
              Any
            </Text>
          )}
        </Flex>

        {running !== undefined && running.length > 0 && (
          <Flex direction="column" gap="0.5">
            <Text variant="body-small" color="secondary">
              Running
            </Text>
            <MixSummary entries={running} />
          </Flex>
        )}
      </Flex>
    </ConfigRow>
  );
};

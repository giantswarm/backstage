import { type ReactNode } from 'react';
import {
  Box,
  ButtonIcon,
  Flex,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@backstage/ui';
import CloseIcon from '@material-ui/icons/Close';
import { type NodePoolTab, useSelectedNodePool } from '../useSelectedNodePool';

interface NodePoolDetailsProps {
  nodePoolName: string;
  /** Shown on the Nodes tab label; omitted while unknown. */
  nodeCount: number | undefined;
  configuration: ReactNode;
  nodes: ReactNode;
  onClose: () => void;
}

export const NodePoolDetails = ({
  nodePoolName,
  nodeCount,
  configuration,
  nodes,
  onClose,
}: NodePoolDetailsProps) => {
  const { selectedTab, setSelectedTab } = useSelectedNodePool();

  return (
    <Flex direction="column" gap="3">
      <Flex align="center" justify="between">
        <Text as="h3" variant="title-x-small" weight="bold">
          {nodePoolName}
        </Text>
        <ButtonIcon
          variant="tertiary"
          size="small"
          icon={<CloseIcon fontSize="small" />}
          aria-label="Close node pool details"
          onPress={onClose}
        />
      </Flex>

      {/* Controlled by the URL, so no `href` on the tabs: a routed tab would
          fight the controlled `selectedKey`. */}
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={key => setSelectedTab(key as NodePoolTab)}
      >
        <TabList>
          <Tab id="configuration">Configuration</Tab>
          <Tab id="nodes">
            {nodeCount === undefined ? 'Nodes' : `Nodes (${nodeCount})`}
          </Tab>
        </TabList>
        <TabPanel id="configuration">
          <Box pt="4">{configuration}</Box>
        </TabPanel>
        <TabPanel id="nodes">
          <Box pt="4">{nodes}</Box>
        </TabPanel>
      </Tabs>
    </Flex>
  );
};

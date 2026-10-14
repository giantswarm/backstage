import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@backstage/ui';
import { FactList } from '../FactList';
import { InfoCard } from '../InfoCard';
import { TechnicalDetailsFoldOut } from './TechnicalDetailsFoldOut';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/TechnicalDetailsFoldOut',
  component: TechnicalDetailsFoldOut,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The "Technical details" fold-out of an agent-platform detail page: ' +
            'an outlined accordion whose content mounts only while open.',
          whenToUse:
            'The one way to offer technical detail (the Kubernetes resource, ' +
            'its GitOps source, its conditions) on an agent-platform page, ' +
            'never a page-wide switch. The agent, model and connector pages ' +
            'use it. Open it on arrival while the resource is unhealthy, so ' +
            'the reason is in view.',
          migration: 'mixed',
          extra:
            '`defaultExpanded` seeds the first render. With ' +
            '`followDefaultExpanded` the fold-out follows later changes of it ' +
            'until the person toggles it, for a page that renders from the ' +
            'cache first; key it by the resource so another one starts afresh.',
        }),
      },
    },
  },
  decorators: [
    Story => (
      <Box style={{ maxWidth: 720 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof TechnicalDetailsFoldOut>;

export default meta;
type Story = StoryObj<typeof meta>;

const content = (
  <InfoCard title="Resource">
    <FactList
      facts={[
        { label: 'MCPServer', value: 'muster/jira' },
        { label: 'Origin', value: 'Added through muster, not Git' },
      ]}
      labelWidth={160}
      maxWidth={null}
    />
  </InfoCard>
);

export const Default: Story = {
  args: { defaultExpanded: false, children: content },
};

export const Expanded: Story = {
  name: 'Open on arrival',
  args: { defaultExpanded: true, children: content },
};

import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@backstage/ui';
import { FactList } from '../FactList';
import { Mono } from './Mono';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/Mono',
  component: Mono,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'An identifier in small monospace that breaks anywhere, so a long ' +
            'name or ARN never widens its column.',
          whenToUse:
            'Names someone may retype into `kubectl` or `git` inside the ' +
            'Technical details fold-outs: a resource `namespace/name`, a ' +
            'HelmRelease, a Secret key, a URL. `MONO` is the same style for ' +
            'an element that is not a `Text`.',
          migration: 'bui',
        }),
      },
    },
  },
  decorators: [
    Story => (
      <Box style={{ maxWidth: 360 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof Mono>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'flux-giantswarm/grafana-mcp' },
};

export const InAFactList: Story = {
  name: 'In a fact list',
  args: { children: 'muster/jira' },
  render: () => (
    <FactList
      facts={[
        { label: 'MCPServer', value: <Mono>muster/jira</Mono> },
        {
          label: 'Assumed role',
          value: (
            <Mono>
              arn:aws:iam::123456789012:role/agent-platform-cloudwatch-reader
            </Mono>
          ),
        },
      ]}
      maxWidth={null}
    />
  ),
};

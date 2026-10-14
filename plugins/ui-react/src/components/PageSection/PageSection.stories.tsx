import type { Meta, StoryObj } from '@storybook/react';
import { Link, Text } from '@backstage/ui';
import { PageSection } from './PageSection';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/PageSection',
  component: PageSection,
  tags: ['autodocs'],
  args: {
    title: 'What it’s for',
    children: (
      <Text as="p" variant="body-medium" style={{ margin: 0 }}>
        Deploys an app and tells the team.
      </Text>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A section of a detail page tab: an `h2` heading at `title-x-small`, ' +
            'an optional sentence and action, then the content, one gap apart.',
          whenToUse:
            'For the sections of a shell detail page tab, such as the agent, ' +
            "skill and workflow pages' Overview. The region is named by its " +
            'heading.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof PageSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    title: 'What it needs',
    description: 'An agent passes these inputs when running it.',
  },
};

export const WithAction: Story = {
  args: {
    title: 'Skills',
    action: <Link href="#">Update skills</Link>,
  },
};

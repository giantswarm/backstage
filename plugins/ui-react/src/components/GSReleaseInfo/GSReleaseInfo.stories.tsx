import type { Meta, StoryObj } from '@storybook/react';
import { ShellScopeProvider } from '../ShellScope';
import { GSReleaseInfo } from './GSReleaseInfo';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/GSReleaseInfo',
  component: GSReleaseInfo,
  tags: ['autodocs'],
  args: {
    version: '0.220.3',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The portal’s own release as a quiet footer line, linked to the giantswarm/backstage repository and, for a release or RC, to its release tag.',
          whenToUse:
            'At the bottom of the classic home page and in the shell’s Profile and settings footer. The caller reads `app.releaseVersion` and leaves the line out when it is unset.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof GSReleaseInfo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Release: Story = {};

export const WithoutReleaseVersion: Story = {
  args: { version: '0.220.3-3f2a9c1' },
  parameters: {
    docs: {
      description: {
        story:
          'A branch build’s version has no release tag, so it is shown as it is, without a link.',
      },
    },
  },
};

export const InShell: Story = {
  decorators: [
    Story => (
      <ShellScopeProvider>
        <Story />
      </ShellScopeProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Inside the agent-platform shell, both new-tab links end in “↗”, like the shell’s other new-tab links.',
      },
    },
  },
};

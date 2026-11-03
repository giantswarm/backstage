import type { Meta, StoryObj } from '@storybook/react';
import { CommitSha } from './CommitSha';
import { MONO } from '../Mono';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/CommitSha',
  component: CommitSha,
  tags: ['autodocs'],
  args: { value: '9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca' },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A git commit SHA in 7 characters (`shortSha`), the full value ' +
            'as its `title` and, on a touch screen, a copy button beside it. ' +
            'A value with no SHA in it renders as it is.',
          whenToUse:
            'Wherever the portal shows a commit: a pin, a revision, a Flux ' +
            'revision (`main@sha1:…`), a version that carries one. Inside a ' +
            'link or a selectable card, where a button cannot go, render ' +
            '`shortSha` with the full value as the element’s `title` instead.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof CommitSha>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FluxRevision: Story = {
  name: 'A Flux revision, in monospace',
  args: {
    value: 'main@sha1:9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
    style: MONO,
  },
};

export const Digest: Story = {
  name: 'A sha256 digest keeps 12 characters',
  args: { value: `sha256:${'4f'.repeat(32)}` },
};

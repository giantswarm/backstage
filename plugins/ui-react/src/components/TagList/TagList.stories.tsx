import type { Meta, StoryObj } from '@storybook/react';
import { TagList } from './TagList';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/TagList',
  component: TagList,
  tags: ['autodocs'],
  args: {
    tags: ['triage', 'kubernetes', 'on-call', 'marketing', 'util'],
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            "A resource's tags, read-only: small badges that take no focus or press, so a row they sit in stays one link. With `getHref`, each tag is a link instead.",
          whenToUse:
            'To show the tags of an agent, skill, connector or workflow: on a list row with `max` (the rest as "+N"), and on a detail page with `getHref` pointing at the catalog filtered by the tag (`tagHref`).',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof TagList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};

/** A list row: the first three, then "+2". */
export const Capped: Story = { args: { max: 3 } };

/** A detail page: each tag opens the catalog filtered by it. */
export const Linked: Story = {
  args: { getHref: tag => `/customize/agents?tags=${tag}` },
};

/** A 63-character tag is cut with an ellipsis and read whole on hover. */
export const LongTag: Story = {
  args: {
    tags: [
      'a-very-long-tag-that-takes-the-whole-sixty-three-characters-xyz',
      'short',
    ],
  },
};

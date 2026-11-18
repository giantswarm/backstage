import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Flex } from '@backstage/ui';
import { TagsField } from './TagsField';
import { addTags } from '../../lib/tags';
import { componentDocs } from '../../storybook/docs';

const COUNTS: ReadonlyMap<string, number> = new Map([
  ['kubernetes', 12],
  ['triage', 7],
  ['marketing', 4],
  ['on-call', 3],
  ['util', 2],
]);

/** A form's tags, held as the agent, connector and skill forms hold them. */
function TagsForm({ initial }: { initial: string[] }) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');
  return (
    <Flex direction="column" style={{ maxWidth: 420 }}>
      <TagsField
        tags={tags}
        draft={draft}
        error={undefined}
        counts={COUNTS}
        onDraftChange={setDraft}
        onAdd={added => setTags(current => addTags(current, added))}
        onRemove={tag => setTags(current => current.filter(t => t !== tag))}
      />
    </Flex>
  );
}

const meta = {
  title: 'Components/TagsField',
  component: TagsField,
  tags: ['autodocs'],
  args: {
    tags: [],
    draft: '',
    error: undefined,
    onDraftChange: () => {},
    onAdd: () => {},
    onRemove: () => {},
  },
  render: () => <TagsForm initial={[]} />,
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A form\'s tags: Enter, a comma or leaving the field adds what was typed, normalized (`On Call` is `on-call`). Tags already in use are offered while typing, and a new tag close to an existing one gets an "Existing:" hint that swaps it in.',
          whenToUse:
            'In a create or edit form for anything with tags (agents, skills, connectors). Inside the agent shell the suggestions come from `TagVocabularyProvider`; elsewhere from `counts`.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof TagsField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Type `ku` for suggestions, or `kubernetis` and Enter for the hint. */
export const Empty: Story = {};

export const WithTags: Story = {
  render: () => <TagsForm initial={['triage', 'on-call']} />,
};

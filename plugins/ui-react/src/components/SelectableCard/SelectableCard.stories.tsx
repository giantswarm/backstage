import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Text } from '@backstage/ui';
import { SelectableCard, SelectableCardGrid } from './SelectableCard';
import { componentDocs } from '../../storybook/docs';

const TRANSPORTS = [
  {
    id: 'http',
    name: 'Streamable HTTP',
    description: 'A server reachable by URL.',
  },
  {
    id: 'sse',
    name: 'SSE',
    description: 'An older server using server-sent events.',
  },
  {
    id: 'stdio',
    name: 'Local process',
    description: 'A command run next to muster.',
  },
];

const meta = {
  title: 'Components/SelectableCard',
  component: SelectableCard,
  tags: ['autodocs'],
  args: {
    role: 'radio',
    selected: false,
    ariaLabel: 'Streamable HTTP',
    onSelect: () => {},
    children: 'Streamable HTTP',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A card a person picks: single-select (`radio`) or multi-select (`checkbox`), laid out in a `SelectableCardGrid`.',
          whenToUse:
            'For a choice between a few options that each need a sentence of explanation, e.g. a wizard’s transport or auth mode. For a short list of plain labels, use bui `RadioGroup` or `Checkbox`.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof SelectableCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleSelect: Story = {
  render: function Render() {
    const [selected, setSelected] = useState('http');
    return (
      <SelectableCardGrid role="radiogroup" ariaLabel="Transport">
        {TRANSPORTS.map(transport => (
          <SelectableCard
            key={transport.id}
            role="radio"
            ariaLabel={transport.name}
            selected={selected === transport.id}
            onSelect={() => setSelected(transport.id)}
          >
            <Text weight="bold">{transport.name}</Text>
            <Text color="secondary">{transport.description}</Text>
          </SelectableCard>
        ))}
      </SelectableCardGrid>
    );
  },
};

export const MultiSelect: Story = {
  render: function Render() {
    const [selected, setSelected] = useState<string[]>(['http']);
    const toggle = (id: string) =>
      setSelected(current =>
        current.includes(id)
          ? current.filter(other => other !== id)
          : [...current, id],
      );
    return (
      <SelectableCardGrid role="group" ariaLabel="Transports">
        {TRANSPORTS.map(transport => (
          <SelectableCard
            key={transport.id}
            role="checkbox"
            ariaLabel={transport.name}
            selected={selected.includes(transport.id)}
            onSelect={() => toggle(transport.id)}
            disabled={transport.id === 'stdio'}
          >
            <Text weight="bold">{transport.name}</Text>
            <Text color="secondary">{transport.description}</Text>
          </SelectableCard>
        ))}
      </SelectableCardGrid>
    );
  },
};

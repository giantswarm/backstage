import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import { Badge, ButtonIcon, Flex, Text } from '@backstage/ui';
// Imported by its own path, never through `@giantswarm/backstage-plugin-muster`:
// the plugin barrel drags the whole plugin graph (including the 500-file `gs`
// plugin) through Vite for what is meant to be a single-component page.
import { ToolTable, ToolTableItem, toolTableItem } from './ToolTable';
import { ToolSummary } from '../../../apis';

/**
 * Fixtures shaped like what `filter_tools` actually returns: a couple of
 * annotated tools among mostly unannotated ones, summaries that run past the
 * width of the column, and the `x_`-prefixed names of an aggregated server.
 */
const TOOLS: ToolSummary[] = [
  {
    name: 'core_service_list',
    summary: 'List the services muster is aggregating right now.',
    annotations: { readOnlyHint: true },
  },
  {
    name: 'core_service_delete',
    summary: 'Remove a service from the aggregator.',
    annotations: { destructiveHint: true },
  },
  {
    name: 'x_kubernetes_list_pods',
    summary:
      'List the pods in a namespace, optionally filtered by label selector, field selector and phase — the long form of this summary is here to show what happens when a description runs past the width of its column.',
    annotations: { readOnlyHint: true },
  },
  {
    name: 'x_kubernetes_delete_pod',
    summary: 'Delete a pod. The controller may recreate it.',
    annotations: { destructiveHint: true },
  },
  {
    name: 'x_prometheus_query',
    summary: 'Run an instant PromQL query against a management cluster.',
  },
  {
    name: 'workflow_cluster_upgrade',
    summary: 'Upgrade a workload cluster to a new release version.',
  },
];

/** The same tools with every annotation stripped — the common case. */
const UNANNOTATED: ToolSummary[] = TOOLS.map(
  ({ annotations, ...tool }) => tool,
);

const meta = {
  title: 'Muster/ToolTable',
  component: ToolTable,
  tags: ['autodocs'],
  parameters: {
    docs: {
      // Show the story's own source, never a serialisation of what it
      // rendered. `items` carries React elements (a `ButtonIcon` in
      // `trailing`, a `Badge` in `meta`) and Storybook's dynamic "Show code"
      // serialiser walks those element trees recursively — on this file it
      // allocated ~3.5 GB and died with "Invalid string length" (V8's maximum
      // string), taking the whole docs page with it. The CSF source is also
      // simply the more useful thing to read: it is what a caller would copy.
      source: { type: 'code' },
      description: {
        component: [
          'The house list of tools: a borderless table of name, markers and description, without a header row.',
          '',
          '**When to use it:** wherever tools are listed — the Tool Explorer, an agent’s resolved toolset, the toolset pickers. One component behind all of them, so they cannot drift apart. What changes between surfaces is the row’s `mode` (shown, linked, selectable, checkable), not its typography.',
          '',
          '⚠️ **Migration status: mixed.** A bui (`@backstage/ui`) `Text` inside MUI v4 (`@material-ui/core`) `makeStyles`. The styling is a candidate for migration once bui exposes the tokens.',
          '',
          'Presentational by design: it renders exactly the `items` it is given, in order. Grouping, searching and paging belong to the caller — a long list is a `ShowMore` or an accordion wrapped around this, not a prop on it.',
          '',
          'Columns are a CSS grid on the list with `subgrid` on each row, so they line up without a header. The marker column only exists when some row in the list actually has a marker, so an unannotated catalogue costs no width.',
        ].join('\n'),
      },
    },
  },
  args: {
    ariaLabel: 'Tools',
  },
} satisfies Meta<typeof ToolTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The read-only default: what an agent's resolved toolset shows. */
export const Static: Story = {
  args: {
    items: TOOLS.map(tool => toolTableItem(tool, { mode: { kind: 'static' } })),
  },
};

/**
 * No row in this list carries an annotation, so the marker column is not
 * rendered at all — the description starts right after the longest name
 * instead of after a gap no row can fill.
 */
export const WithoutMarkers: Story = {
  args: {
    items: UNANNOTATED.map(tool =>
      toolTableItem(tool, { mode: { kind: 'static' } }),
    ),
  },
};

/** Names link into the Tool Explorer — an agent's toolset card. */
export const Links: Story = {
  args: {
    items: TOOLS.map(tool =>
      toolTableItem(tool, {
        mode: {
          kind: 'link',
          href: `/agent-platform/muster/tools?tool=${tool.name}`,
        },
      }),
    ),
  },
};

/** A tool with no summary at all, next to tools that have one. */
export const MissingDescriptions: Story = {
  args: {
    items: [
      toolTableItem(TOOLS[0], { mode: { kind: 'static' } }),
      {
        key: 'x_legacy_do_thing',
        name: 'x_legacy_do_thing',
        mode: { kind: 'static' },
      },
      toolTableItem(TOOLS[4], { mode: { kind: 'static' } }),
    ],
  },
};

export const Empty: Story = {
  args: {
    items: [],
    emptyText: 'This toolset resolves to no tools for you right now.',
  },
};

/**
 * One long name against short ones: the name column takes the width it needs
 * (`max-content`) and the description takes the rest, so the columns stay
 * aligned down the table.
 */
export const LongNames: Story = {
  args: {
    items: [
      {
        key: 'short',
        name: 'core_ping',
        description: 'Check that the aggregator answers.',
        mode: { kind: 'static' },
      },
      {
        key: 'long',
        name: 'x_agent_manager_update_agent_toolset_selectors',
        description:
          'Replace the toolset selectors an agent declares on its gateway server.',
        mode: { kind: 'static' },
      },
      {
        key: 'mid',
        name: 'x_prometheus_query',
        description: 'Run an instant PromQL query.',
        mode: { kind: 'static' },
      },
    ],
  },
};

/**
 * The Tool Explorer's browse list: the whole row selects the tool, a search
 * score rides beside the markers, and the favourite star sits outside the
 * row's own hit area (a button cannot nest inside a button).
 *
 * `core_service_list` is selected — currently open in the detail panel — and
 * `x_kubernetes_list_pods` is *active*: keyboard-highlighted, what ↵ would
 * open. The two states are deliberately distinct.
 */
export const ExplorerRows: Story = {
  render: function Render(args) {
    const [selected, setSelected] = useState('core_service_list');
    const [favourites, setFavourites] = useState<string[]>([
      'x_prometheus_query',
    ]);

    const toggleFavourite = (name: string) =>
      setFavourites(current =>
        current.includes(name)
          ? current.filter(entry => entry !== name)
          : [...current, name],
      );

    const items: ToolTableItem[] = TOOLS.map((tool, index) =>
      toolTableItem(tool, {
        mode: {
          kind: 'action',
          onSelect: () => setSelected(tool.name),
          selected: tool.name === selected,
          active: index === 2,
        },
        meta: index === 2 ? <Badge size="small">score 8.4</Badge> : undefined,
        trailing: (
          <ButtonIcon
            variant="tertiary"
            size="small"
            aria-label={
              favourites.includes(tool.name)
                ? `Remove ${tool.name} from favourites`
                : `Add ${tool.name} to favourites`
            }
            icon={
              favourites.includes(tool.name) ? (
                <StarIcon fontSize="small" color="primary" />
              ) : (
                <StarBorderIcon fontSize="small" />
              )
            }
            onClick={() => toggleFavourite(tool.name)}
          />
        ),
      }),
    );

    return (
      <Flex direction="column" gap="2">
        <ToolTable {...args} items={items} />
        <Text variant="body-small" color="secondary">
          Selected: <code>{selected}</code>
        </Text>
      </Flex>
    );
  },
  args: { items: [], ariaLabel: 'Tools' },
};

/**
 * The toolset picker: each row is a checkbox. The indicator takes a column of
 * its own so the names still line up.
 */
export const Checkboxes: Story = {
  render: function Render(args) {
    const [picked, setPicked] = useState<string[]>(['x_prometheus_query']);

    const toggle = (name: string) =>
      setPicked(current =>
        current.includes(name)
          ? current.filter(entry => entry !== name)
          : [...current, name],
      );

    const items: ToolTableItem[] = TOOLS.map(tool =>
      toolTableItem(tool, {
        mode: {
          kind: 'select',
          role: 'checkbox',
          checked: picked.includes(tool.name),
          onToggle: () => toggle(tool.name),
        },
      }),
    );

    return (
      <Flex direction="column" gap="2">
        <ToolTable {...args} items={items} role="group" />
        <Text variant="body-small" color="secondary">
          {picked.length} selected
        </Text>
      </Flex>
    );
  },
  args: { items: [], ariaLabel: 'Pick tools' },
};

/** Single-select, for a list of presets rather than tools. */
export const Radios: Story = {
  render: function Render(args) {
    const [picked, setPicked] = useState('preset:read-only');

    const presets = [
      {
        name: 'preset:none',
        description: 'A chat-only agent. No tools at all.',
      },
      {
        name: 'preset:read-only',
        description: 'Every tool its server annotates as read-only.',
      },
      {
        name: 'preset:full',
        description:
          'Every tool the gateway exposes, platform administration included.',
      },
    ];

    const items: ToolTableItem[] = presets.map(preset => ({
      key: preset.name,
      name: preset.name,
      description: preset.description,
      mode: {
        kind: 'select',
        role: 'radio',
        checked: picked === preset.name,
        onToggle: () => setPicked(preset.name),
      },
    }));

    return <ToolTable {...args} items={items} role="radiogroup" />;
  },
  args: {
    items: [],
    ariaLabel: 'Pick a preset',
    role: 'group',
  },
};

/**
 * Every mode stacked, which is how the four surfaces will look once they all
 * render through this component. Compare the row heights and the name
 * typography — they should be indistinguishable between blocks.
 */
export const AllModes: Story = {
  render: function Render() {
    const blocks: { title: string; items: ToolTableItem[] }[] = [
      {
        title: 'static',
        items: TOOLS.slice(0, 3).map(tool =>
          toolTableItem(tool, { mode: { kind: 'static' } }),
        ),
      },
      {
        title: 'link',
        items: TOOLS.slice(0, 3).map(tool =>
          toolTableItem(tool, { mode: { kind: 'link', href: '#' } }),
        ),
      },
      {
        title: 'action',
        items: TOOLS.slice(0, 3).map((tool, index) =>
          toolTableItem(tool, {
            mode: {
              kind: 'action',
              onSelect: () => {},
              selected: index === 0,
            },
          }),
        ),
      },
      {
        title: 'select',
        items: TOOLS.slice(0, 3).map((tool, index) =>
          toolTableItem(tool, {
            mode: {
              kind: 'select',
              role: 'checkbox',
              checked: index === 1,
              onToggle: () => {},
            },
          }),
        ),
      },
    ];

    return (
      <Flex direction="column" gap="4">
        {blocks.map(block => (
          <Flex key={block.title} direction="column" gap="1">
            <Text variant="body-small" weight="bold">
              {block.title}
            </Text>
            <ToolTable items={block.items} ariaLabel={block.title} />
          </Flex>
        ))}
      </Flex>
    );
  },
  args: { items: [], ariaLabel: 'All modes' },
};

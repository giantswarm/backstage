import type { Meta, StoryObj } from '@storybook/react';
import { Box, Card, CardBody, Flex, Text } from '@backstage/ui';
// Imported by their own paths, never through `@giantswarm/backstage-plugin-muster`:
// the plugin barrel drags the whole plugin graph through Vite.
import { EffectBadge } from './EffectBadge';
import { MarkerBadge } from '../MarkerBadge';

const meta = {
  title: 'Muster/EffectBadge',
  component: EffectBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Whether a tool (or a workflow) only reads or changes things, as a small badge.',
          '',
          '**When to use it:** wherever a tool’s or a workflow’s effect is shown — a connector’s tool list, a tool page, the workflow list and flow, an agent’s tool catalogue, the approval card. Take the effect from `toolEffect` (a workflow’s from `workflowEffect`); never hand-roll the words or the colours.',
          '',
          '“Reads” is neutral: a fill one step above the surface and a quiet edge, so it shows as a box on the agent shell’s white page. On a bui surface it knows (a `Card`, a `Box bg="neutral"`) bui steps the fill itself. “Changes things” is the stronger signal, in bui’s warning tone. Both set their text in `--bui-font-size-2`, the text size of bui’s medium badge, at the small badge’s height, on one line.',
          '',
          '`size="compact"` (18px high) is for a marker riding the edge of a box: a step on the workflow flow canvas and in its phone list.',
          '',
          'Drawn by `MarkerBadge`, which the other markers beside it (a workflow step’s number, “May fail”) use too.',
        ].join('\n'),
      },
    },
  },
  args: {
    effect: 'reads',
  },
} satisfies Meta<typeof EffectBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A tool's effect, both kinds side by side. */
export const Tool: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <EffectBadge effect="reads" />
      <EffectBadge effect="changes" />
    </Flex>
  ),
};

/** A workflow's derived effect, worded as the guarantee it is. */
export const Workflow: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <EffectBadge effect="reads" subject="workflow" />
      <EffectBadge effect="changes" subject="workflow" />
    </Flex>
  ),
};

/** Beside a tool's name, the way a connector's tool list shows it. */
export const InAToolRow: Story = {
  render: () => (
    <Flex direction="column" gap="3">
      {[
        { name: 'get_repository', effect: 'reads' as const },
        { name: 'create_repository', effect: 'changes' as const },
      ].map(tool => (
        <Flex key={tool.name} gap="2" align="center">
          <Text weight="bold">{tool.name}</Text>
          <EffectBadge effect={tool.effect} />
        </Flex>
      ))}
    </Flex>
  ),
};

/** Another marker on a workflow step uses the same look. */
export const WithOtherMarkers: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <EffectBadge effect="changes" />
      <MarkerBadge tone="neutral">May fail</MarkerBadge>
    </Flex>
  ),
};

/**
 * The compact size a workflow step's markers ride its top edge in: the step's
 * number (round), what its tool does and whether it may fail.
 */
export const Compact: Story = {
  render: () => (
    <Flex gap="1" align="center">
      <MarkerBadge tone="neutral" size="compact" className="story-step-number">
        3
      </MarkerBadge>
      <EffectBadge effect="reads" size="compact" />
      <EffectBadge effect="changes" size="compact" />
      <MarkerBadge tone="neutral" size="compact">
        May fail
      </MarkerBadge>
      <style>{`.story-step-number { min-width: 18px; box-sizing: border-box; border-radius: 9px; }`}</style>
    </Flex>
  ),
};

/** On the page, on a card and on a nested surface: the box shows on each. */
export const OnSurfaces: Story = {
  render: () => (
    <Flex direction="column" gap="3">
      <Flex gap="2" align="center">
        <EffectBadge effect="reads" />
        <EffectBadge effect="changes" />
      </Flex>
      <Card>
        <CardBody>
          <Flex direction="column" gap="3">
            <Flex gap="2" align="center">
              <EffectBadge effect="reads" />
              <EffectBadge effect="changes" />
            </Flex>
            <Box bg="neutral" p="3">
              <Flex gap="2" align="center">
                <EffectBadge effect="reads" />
                <EffectBadge effect="changes" />
              </Flex>
            </Box>
          </Flex>
        </CardBody>
      </Card>
    </Flex>
  ),
};

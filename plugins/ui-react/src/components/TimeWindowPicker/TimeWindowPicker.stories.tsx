import { ReactNode, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  FieldLabel,
  Flex,
  Select,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { TimeWindowPicker } from './TimeWindowPicker';
import { componentDocs } from '../../storybook/docs';

const OPTIONS = [7, 30, 90] as const;
type Days = (typeof OPTIONS)[number];

const meta = {
  title: 'Components/TimeWindowPicker',
  component: TimeWindowPicker,
  tags: ['autodocs'],
  args: {
    options: OPTIONS,
    value: 30,
    onChange: () => {},
  },
  parameters: {
    agentShell: true,
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A choice of time window phrased once — "Last [7 | 30 | 90] days" — ' +
            'where only the number is picked. A radio group named by its label, ' +
            'each option named in full ("Last 7 days"), in a field box as tall ' +
            'as a bui `Select`.',
          whenToUse:
            '- A scope control that switches the window of a whole surface, ' +
            'such as the Usage screen, beside the Environment select.\n' +
            '- A handful of fixed windows. For a free range use bui ' +
            '`DateRangePicker`; to filter a list by a field, a dropdown.',
          migration: 'mixed',
          extra:
            'Built on bui `ToggleButtonGroup` and `FieldLabel`, restyled with ' +
            "`makeStyles` to the shell's field box. The **Variants** story " +
            'compares it with the alternatives that were considered.',
        }),
      },
    },
  },
} satisfies Meta<typeof TimeWindowPicker<Days>>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({
  initial = 30,
  unavailableReason,
}: {
  initial?: Days;
  unavailableReason?: (days: Days) => string | undefined;
}) {
  const [days, setDays] = useState<Days>(initial);
  return (
    <TimeWindowPicker
      options={OPTIONS}
      value={days}
      onChange={setDays}
      unavailableReason={unavailableReason}
    />
  );
}

export const Default: Story = {
  render: () => <Controlled />,
};

const KEEPS_30 = (days: Days) =>
  days > 30 ? 'kagent keeps 30 days of session usage' : undefined;

/** A window the data cannot cover is disabled; hover it for the reason. */
export const UnavailableWindow: Story = {
  render: () => <Controlled unavailableReason={KEEPS_30} />,
};

/** A deep link selected a window that is not on offer: it stays marked, grey. */
export const UnavailableWindowSelected: Story = {
  render: () => <Controlled initial={90} unavailableReason={KEEPS_30} />,
};

// The header's action row as ShellPage lays it out: wrapped, 8px apart, and
// bottom-aligned once it holds a labelled field, so the boxes line up.
function ActionRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      {children}
    </div>
  );
}

function EnvironmentSelect() {
  return (
    <div style={{ minWidth: 200 }}>
      <Select
        label="Environment"
        selectedKey="all"
        options={[
          { id: 'all', label: 'All installations' },
          { id: 'alpha', label: 'alpha' },
          { id: 'beta', label: 'beta' },
        ]}
      />
    </div>
  );
}

function Variant({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" gap="2">
      <Text variant="title-x-small" as="h3" style={{ margin: 0 }}>
        {title}
      </Text>
      <Text variant="body-small" color="secondary" as="p" style={{ margin: 0 }}>
        {note}
      </Text>
      <ActionRow>
        <EnvironmentSelect />
        {children}
      </ActionRow>
    </Flex>
  );
}

function CurrentToggle({ labelled }: { labelled?: boolean }) {
  const [days, setDays] = useState<Days>(30);
  const group = (
    <ToggleButtonGroup
      aria-label="Time range"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[String(days)]}
      onSelectionChange={keys => setDays(Number([...keys][0]) as Days)}
    >
      {OPTIONS.map(option => (
        <ToggleButton key={option} id={String(option)} size="small">
          {option} days
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
  if (!labelled) {
    return group;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <FieldLabel label="Time range" />
      {group}
    </div>
  );
}

function WindowSelect() {
  const [days, setDays] = useState<Days>(30);
  return (
    <div style={{ minWidth: 150 }}>
      <Select
        label="Time range"
        selectedKey={String(days)}
        onSelectionChange={key => setDays(Number(key) as Days)}
        options={OPTIONS.map(option => ({
          id: String(option),
          label: `Last ${option} days`,
        }))}
      />
    </div>
  );
}

/**
 * The time window controls that were considered, each beside the Environment
 * select in the Usage header's row and in the shell's styles. B is the one in
 * use.
 */
export const Variants: Story = {
  render: () => (
    <Flex direction="column" gap="6">
      <Variant
        title="Before: bui ToggleButtonGroup, unlabelled"
        note="Repeats 'days' three times; a solid navy block outweighs the select, and with no label it is not paired with it."
      >
        <CurrentToggle />
      </Variant>
      <Variant
        title="A: a select, 'Last 30 days'"
        note="Matches the Environment select exactly, but hides the other two windows behind a click, and reverses the direct 7 | 30 | 90 choice the scope-selector carve-out keeps."
      >
        <WindowSelect />
      </Variant>
      <Variant
        title="B (recommended): TimeWindowPicker, 'Last [7 | 30 | 90] days'"
        note="One click, every window visible; 'Last' and 'days' said once; the select's label, box, edge, radius and height; a light selection with an edge."
      >
        <Controlled />
      </Variant>
      <Variant
        title="C: bui ToggleButtonGroup with a label"
        note="Fixes the alignment only: still three 'days' and the heavy navy selection."
      >
        <CurrentToggle labelled />
      </Variant>
    </Flex>
  ),
};

/** At 375px the row wraps, each control under its own label. */
export const PhoneWidth: Story = {
  render: () => (
    <div style={{ width: 343, outline: '1px dashed var(--bui-border-2)' }}>
      <ActionRow>
        <EnvironmentSelect />
        <Controlled />
      </ActionRow>
    </div>
  ),
};

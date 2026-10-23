import { ReactNode, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Select } from '@backstage/ui';
import { LastDaysSelect, type LastDaysSelectProps } from './LastDaysSelect';
import { componentDocs } from '../../storybook/docs';

const OPTIONS = [7, 30, 90] as const;
type Days = (typeof OPTIONS)[number];

function Controlled({ value, onChange, ...props }: LastDaysSelectProps<Days>) {
  const [days, setDays] = useState<Days>(value);
  return (
    <LastDaysSelect
      {...props}
      value={days}
      onChange={next => {
        setDays(next);
        onChange(next);
      }}
    />
  );
}

const meta = {
  title: 'Components/LastDaysSelect',
  component: LastDaysSelect,
  tags: ['autodocs'],
  args: {
    options: OPTIONS,
    value: 30,
    label: 'Time range',
    onChange: () => {},
  },
  // Every story reads its args: the value and label from Controls, the rest
  // from the story. Keyed on the value so a new one re-initialises it.
  render: args => <Controlled key={String(args.value)} {...args} />,
  parameters: {
    agentShell: true,
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A select of a few windows of whole days up to today, each option ' +
            'reading "Last 7 days", "Last 30 days", … A plain bui `Select` with ' +
            'its label above, so it lines up with the selects beside it.',
          whenToUse:
            '- A scope control that switches the window of a whole surface, ' +
            'such as the Usage screen, beside the Environment select.\n' +
            '- A handful of fixed windows in days. For hours, months or a ' +
            'window ahead, this is the wrong control; for a free range use bui ' +
            '`DateRangePicker`.\n' +
            '- A window that cannot be chosen is a disabled option with the ' +
            'reason under its name (`unavailableReason`).',
          migration: 'bui',
          extra:
            "These stories render in the agent-platform shell's look, which is " +
            'light only, so the toolbar theme does not apply.',
        }),
      },
    },
  },
} satisfies Meta<typeof LastDaysSelect<Days>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const KEEPS_30 = (days: number) =>
  days > 30 ? 'kagent keeps 30 days of session usage' : undefined;

/** A window the data cannot cover is disabled; open the select for the reason. */
export const UnavailableWindow: Story = {
  args: { unavailableReason: KEEPS_30 },
};

/** A deep link selected a window that is not on offer: the select shows it. */
export const UnavailableWindowSelected: Story = {
  args: { value: 90, unavailableReason: KEEPS_30 },
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

/** In the Usage header, beside the Environment select. */
export const BesideEnvironment: Story = {
  render: args => (
    <ActionRow>
      <EnvironmentSelect />
      <Controlled key={String(args.value)} {...args} />
    </ActionRow>
  ),
};

/** At 375px (343px of content) the row wraps, each select under its label. */
export const PhoneWidth: Story = {
  render: args => (
    <div style={{ width: 343, outline: '1px dashed var(--bui-border-2)' }}>
      <ActionRow>
        <EnvironmentSelect />
        <Controlled key={String(args.value)} {...args} />
      </ActionRow>
    </div>
  ),
};

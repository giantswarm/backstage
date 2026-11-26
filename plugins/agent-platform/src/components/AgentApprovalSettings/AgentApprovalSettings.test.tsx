import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Approvals are what muster reports.
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import type { AgentApprovalDraft } from '../../lib/agentApproval';
import type { AgentApprovalSetting } from '../../lib/agentManager';
import { AgentApprovalSettings } from './AgentApprovalSettings';
import { ExceptionsNote } from './ExceptionsNote';

const merge: ToolSummary = {
  name: 'x_github_merge',
  server: 'github',
  kind: 'tool',
  connectorAdmin: false,
  approval: { setting: 'ask', source: 'tool' },
};
const list: ToolSummary = {
  name: 'x_github_list',
  server: 'github',
  kind: 'tool',
  connectorAdmin: false,
  approval: { setting: 'allow', source: 'tool' },
};
const deploy: ToolSummary = {
  name: 'x_platform_deploy',
  server: 'platform',
  kind: 'tool',
  connectorAdmin: true,
  approval: { setting: 'ask', source: 'governance' },
};

function Harness({
  tools,
  initial = { settings: {} },
  onChange,
}: {
  tools: ToolSummary[];
  initial?: AgentApprovalDraft;
  onChange?: (draft: AgentApprovalDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const update = (next: AgentApprovalDraft) => {
    setDraft(next);
    onChange?.(next);
  };
  return (
    <AgentApprovalSettings
      selection={['server:github', 'server:platform']}
      draft={draft}
      report={{
        status: 'ready',
        tools,
        truncated: false,
        governance: 'trusted',
      }}
      servers={[]}
      labelOf={server => (server === 'github' ? 'GitHub' : server)}
      onSetting={(selector, setting?: AgentApprovalSetting) => {
        const { [selector]: _, ...rest } = draft.settings;
        update({
          ...draft,
          settings: setting ? { ...rest, [selector]: setting } : rest,
        });
      }}
      onDefault={setting => update({ ...draft, default: setting })}
    />
  );
}

describe('AgentApprovalSettings', () => {
  it("disables Allow over a connector's Ask for someone who is no admin of it", async () => {
    await renderInTestApp(<Harness tools={[merge, list]} />);
    const pills = screen.getByRole('radiogroup', {
      name: 'Approval for x_github_merge',
    });
    expect(within(pills).getByRole('radio', { name: 'Allow' })).toBeDisabled();
    expect(within(pills).getByRole('radio', { name: 'Ask' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      screen.getAllByText('Only GitHub admins can allow this.').length,
    ).toBeGreaterThan(0);
    // The connector's whole entry and the default cannot allow it either.
    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Approval for GitHub' }),
      ).getByRole('radio', { name: 'Allow' }),
    ).toBeDisabled();
    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Default approval' }),
      ).getByRole('radio', { name: 'Allow' }),
    ).toBeDisabled();
  });

  it('lets a connector admin allow a tool its connector asks for, as an exception', async () => {
    const onChange = jest.fn();
    await renderInTestApp(
      <Harness
        tools={[{ ...merge, connectorAdmin: true }]}
        onChange={onChange}
      />,
    );
    const pills = screen.getByRole('radiogroup', {
      name: 'Approval for x_github_merge',
    });
    await userEvent.click(within(pills).getByRole('radio', { name: 'Allow' }));
    expect(onChange).toHaveBeenLastCalledWith({
      settings: { 'tool:x_github_merge': 'Allow' },
    });
    expect(screen.getByText(/An exception for this agent/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenLastCalledWith({ settings: {} });
  });

  it('never suggests an exception lifts an Ask the governance mode makes', async () => {
    await renderInTestApp(<Harness tools={[deploy]} />);
    const pills = screen.getByRole('radiogroup', {
      name: 'Approval for x_platform_deploy',
    });
    expect(within(pills).getByRole('radio', { name: 'Allow' })).toBeDisabled();
    expect(
      screen.getByText(/governance mode asks first when an agent calls it/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of its tools always ask/)).toBeInTheDocument();
    expect(
      screen.getByText('Agents can create and start agents without asking.'),
    ).toBeInTheDocument();
  });

  it('sets and clears the default', async () => {
    const onChange = jest.fn();
    await renderInTestApp(<Harness tools={[list]} onChange={onChange} />);
    await userEvent.click(
      within(
        screen.getByRole('radiogroup', { name: 'Default approval' }),
      ).getByRole('radio', { name: 'Block' }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      settings: {},
      default: 'Block',
    });
    await userEvent.click(screen.getByRole('button', { name: 'No default' }));
    expect(onChange).toHaveBeenLastCalledWith({
      settings: {},
      default: undefined,
    });
  });
});

describe('ExceptionsNote', () => {
  it('names the exceptions a save removes before saving', async () => {
    await renderInTestApp(
      <ExceptionsNote
        notAdmin={[{ entry: 'tool:x_github_merge', server: 'github' }]}
        labelOf={() => 'GitHub'}
      />,
    );
    expect(
      screen.getByText(
        'Saving removes 1 exception (x_github_merge). A GitHub admin can grant it again.',
      ),
    ).toBeInTheDocument();
  });
});

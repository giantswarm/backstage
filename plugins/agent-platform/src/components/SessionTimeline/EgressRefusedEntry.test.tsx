import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EgressRefusedItem } from '../../lib/egressRefusals';
import type { EgressRemedy } from '../../lib/egressRemedy';
import { EgressRefusedEntry } from './EgressRefusedEntry';

const npm: EgressRefusedItem = {
  kind: 'egress-refused',
  id: 'r',
  taskIndex: 0,
  at: '2026-10-19T15:13:00Z',
  scheme: 'https',
  host: 'registry.npmjs.org',
  port: 443,
  count: 2,
};

async function renderEntry(
  remedy: EgressRemedy | undefined,
  item: EgressRefusedItem = npm,
  agentName: string | undefined = 'Claude Code',
) {
  await renderInTestApp(
    <EgressRefusedEntry item={item} egressSettings={{ agentName, remedy }} />,
  );
  return screen.getByTestId('timeline-egress-refused');
}

describe('EgressRefusedEntry', () => {
  it('names the host and the agent in plain words, with the count', async () => {
    const entry = await renderEntry({ kind: 'pending' });

    expect(
      within(entry).getByText(
        'Outgoing connection to registry.npmjs.org blocked',
      ),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText(
        /^Claude Code is not allowed to reach this address · .+ · 2 attempts$/,
      ),
    ).toBeInTheDocument();
  });

  it('folds the port, the scheme and the origin into technical details', async () => {
    const entry = await renderEntry({ kind: 'pending' });

    await userEvent.click(
      within(entry).getByRole('button', { name: 'Technical details' }),
    );
    expect(
      within(entry).getByText('registry.npmjs.org:443'),
    ).toBeInTheDocument();
    expect(within(entry).getByText(/\(https\)/)).toBeInTheDocument();
    expect(
      within(entry).getByText('https://registry.npmjs.org'),
    ).toBeInTheDocument();
  });

  it('shows no remedy while the agent is being read', async () => {
    const entry = await renderEntry({ kind: 'pending' });

    expect(within(entry).queryByText(/platform team/)).toBeNull();
    expect(within(entry).queryByText(/can allow|You can/)).toBeNull();
    expect(within(entry).queryByRole('link')).toBeNull();
  });

  it('offers toolchains on a coding Harness where sessions mount them', async () => {
    const entry = await renderEntry({
      kind: 'toolchains',
      runtime: 'Claude Code',
      toolchainsHref: '/customize/toolchains',
      newSessionHref: '/?agent=lab%2Fkagent%2Fclaude-code',
    });

    expect(
      within(entry).getByText(
        /Claude Code can only reach the addresses the platform allows for Claude Code\. Start a session with a toolchain that includes registry\.npmjs\.org, or ask your platform team to allow it\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(entry).getByRole('link', { name: 'Toolchains' }),
    ).toHaveAttribute('href', '/customize/toolchains');
    expect(
      within(entry).getByRole('link', { name: 'Start a session' }),
    ).toHaveAttribute('href', '/?agent=lab%2Fkagent%2Fclaude-code');
    expect(within(entry).queryByText(/Extra egress origins/)).toBeNull();
  });

  it('sends a coding Harness without toolchains to the platform team', async () => {
    const entry = await renderEntry({ kind: 'platform', runtime: 'Codex' });

    expect(
      within(entry).getByText(
        'Claude Code can only reach the addresses the platform allows for Codex. Ask your platform team to allow registry.npmjs.org.',
      ),
    ).toBeInTheDocument();
    expect(within(entry).queryByRole('link')).toBeNull();
  });

  it('says an agent defined in Git is changed there', async () => {
    const entry = await renderEntry({ kind: 'git' });

    expect(
      within(entry).getByText(
        'Claude Code is defined in Git. Its egress is changed there.',
      ),
    ).toBeInTheDocument();
    expect(within(entry).queryByRole('link')).toBeNull();
  });

  it('names an editor and links the agent’s page for a person who is not one', async () => {
    const entry = await renderEntry(
      { kind: 'ask-editor', agentHref: '/customize/agents/lab/team/otter' },
      npm,
      'otter',
    );

    expect(
      within(entry).getByText(
        /An editor of otter can allow registry\.npmjs\.org\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(entry).getByRole('link', { name: 'otter’s page' }),
    ).toHaveAttribute('href', '/customize/agents/lab/team/otter');
  });

  it('links the edit page for a person who can add the origin', async () => {
    const entry = await renderEntry(
      { kind: 'edit', editHref: '/customize/agents/lab/team/otter/edit' },
      npm,
      'otter',
    );

    expect(
      within(entry).getByText(
        /You can allow it: add https:\/\/registry\.npmjs\.org to otter’s Extra egress origins\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(entry).getByRole('link', { name: 'Edit otter' }),
    ).toHaveAttribute('href', '/customize/agents/lab/team/otter/edit');
  });

  it('promises nothing when the agent could not be read', async () => {
    const entry = await renderEntry({ kind: 'neutral' });

    expect(
      within(entry).getByText(
        'If Claude Code needs registry.npmjs.org, ask your platform team.',
      ),
    ).toBeInTheDocument();
    expect(within(entry).queryByRole('link')).toBeNull();
  });

  it('takes the neutral remedy when none is given', async () => {
    await renderInTestApp(<EgressRefusedEntry item={npm} />);
    const entry = screen.getByTestId('timeline-egress-refused');

    expect(
      within(entry).getByText(
        /^This agent is not allowed to reach this address · /,
      ),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText(
        'If this agent needs registry.npmjs.org, ask your platform team.',
      ),
    ).toBeInTheDocument();
  });

  it('names no host the gateway folded', async () => {
    const entry = await renderEntry(
      { kind: 'platform', runtime: 'Claude Code' },
      { ...npm, host: undefined, port: undefined },
    );

    expect(
      within(entry).getByText('Outgoing connection blocked'),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText(/Ask your platform team to allow this address\./),
    ).toBeInTheDocument();
  });

  it('offers no toolchain for a raw TCP destination', async () => {
    const entry = await renderEntry(
      { kind: 'toolchains', runtime: 'Claude Code', toolchainsHref: '/t' },
      { ...npm, scheme: 'tcp', host: '10.0.0.7', port: 22, count: 1 },
    );

    expect(
      within(entry).getByText(
        /^Raw TCP connections are not available to agents · .+ · 1 attempt$/,
      ),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText(/Ask your platform team to allow 10\.0\.0\.7\./),
    ).toBeInTheDocument();
    expect(within(entry).queryByRole('link')).toBeNull();
  });
});

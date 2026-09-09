import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import type { ToolsetResolution } from '../../hooks/useToolsetResolution';
import type { ServerInfo } from '../../lib/toolset';
import { agentsRouteRef } from '../../routes';
import { ToolsetResolutionList } from './ToolsetResolutionList';

const SERVERS: ServerInfo[] = [
  {
    name: 'kubernetes',
    group: 'infrastructure',
    toolNamePrefix: 'x_kubernetes',
    oauth: false,
  },
  {
    name: 'github',
    group: 'registered',
    toolNamePrefix: 'x_github',
    oauth: false,
  },
];

function tool(name: string, extra: Partial<ToolSummary> = {}): ToolSummary {
  return { name, kind: 'tool', ...extra } as ToolSummary;
}

function serverTools(server: string, count: number): ToolSummary[] {
  return Array.from({ length: count }, (_, index) =>
    tool(`x_${server}_op_${String(index).padStart(2, '0')}`, { server }),
  );
}

function workflows(count: number): ToolSummary[] {
  return Array.from({ length: count }, (_, index) =>
    tool(`workflow_flux-step-${String(index).padStart(2, '0')}`, {
      kind: 'workflow',
    }),
  );
}

function resolved(tools: ToolSummary[]): ToolsetResolution {
  return {
    tools,
    unmatched: [],
    truncated: false,
    isLoading: false,
    status: 'resolved',
  };
}

async function renderList(resolution: ToolsetResolution) {
  return renderInTestApp(
    <ToolsetResolutionList resolution={resolution} servers={SERVERS} />,
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
}

/** A resolution big enough that nothing may render expanded. */
const BIG = [
  ...serverTools('kubernetes', 30),
  ...serverTools('github', 25),
  ...workflows(20),
];

describe('ToolsetResolutionList', () => {
  it('shows a short resolution outright, with no search to get in the way', async () => {
    await renderList(
      resolved([
        tool('x_kubernetes_get_pods', {
          server: 'kubernetes',
          annotations: { readOnlyHint: true },
        }),
        tool('workflow_incident-triage', { kind: 'workflow' }),
      ]),
    );

    expect(screen.getByText('x_kubernetes_get_pods')).toBeInTheDocument();
    expect(screen.getByText('workflow_incident-triage')).toBeInTheDocument();
    expect(screen.getByText('read-only')).toBeInTheDocument();
    expect(
      screen.queryByRole('searchbox', { name: 'Search the resolved tools' }),
    ).not.toBeInTheDocument();
  });

  it('opens a large resolution as its counts, with every tool row collapsed away', async () => {
    await renderList(resolved(BIG));

    // The inventory, not the tools.
    expect(
      screen.getByText('2 servers · 55 tools · 20 workflows'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Infrastructure — 1 server · 30 tools',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Registered servers — 1 server · 25 tools',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Workflows — 20 workflows' }),
    ).toBeInTheDocument();
    // Not one row of the 75.
    expect(screen.queryByText('x_kubernetes_op_00')).not.toBeInTheDocument();
    expect(screen.queryByText('workflow_flux-step-00')).not.toBeInTheDocument();
  });

  it('reaches a tool by opening the group and the server, a page of rows at a time', async () => {
    await renderList(resolved(BIG));
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', {
        name: 'Infrastructure — 1 server · 30 tools',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'kubernetes — 30 tools' }),
    );

    expect(screen.getByText('x_kubernetes_op_00')).toBeInTheDocument();
    expect(screen.getByText('20 tools shown, 10 more')).toBeInTheDocument();
    expect(screen.queryByText('x_kubernetes_op_29')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show 10 more tools' }),
    );
    expect(screen.getByText('x_kubernetes_op_29')).toBeInTheDocument();
  });

  it('finds one tool by search, opening the sections it is in and reporting the matches', async () => {
    await renderList(resolved(BIG));
    const user = userEvent.setup();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search the resolved tools' }),
      'github_op_07',
    );

    expect(await screen.findByText('x_github_op_07')).toBeInTheDocument();
    expect(
      screen.getByText('1 tool and 0 workflows match'),
    ).toBeInTheDocument();
    // The groups a match is not in are gone, not merely shut.
    expect(
      screen.queryByRole('button', { name: /^Infrastructure/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear the search' }));

    expect(screen.queryByText('x_github_op_07')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Infrastructure — 1 server · 30 tools',
      }),
    ).toBeInTheDocument();
  });

  it('says so when a search matches nothing', async () => {
    await renderList(resolved(BIG));
    const user = userEvent.setup();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search the resolved tools' }),
      'nothing-like-this',
    );

    expect(
      await screen.findByText('Nothing matches "nothing-like-this".'),
    ).toBeInTheDocument();
  });

  it('groups a long workflow list by name prefix rather than listing it', async () => {
    await renderList(
      resolved([
        ...serverTools('kubernetes', 30),
        ...workflows(8),
        ...Array.from({ length: 6 }, (_, index) =>
          tool(`workflow_cert-manager-${index}`, { kind: 'workflow' }),
        ),
      ]),
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: 'Workflows — 14 workflows' }),
    );

    expect(
      await screen.findByRole('button', {
        name: 'cert-manager — 6 workflows',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'flux-step — 8 workflows' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('workflow_cert-manager-0'),
    ).not.toBeInTheDocument();
  });

  it('renders the non-resolution outcomes as their messages, never as an empty list', async () => {
    await renderList({
      tools: [],
      unmatched: [],
      truncated: false,
      isLoading: false,
      status: 'unknown-preset',
      error: 'unknown preset "reader"',
    });

    expect(
      screen.getByText(
        'The toolset names a preset this installation does not define',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('searchbox', { name: 'Search the resolved tools' }),
    ).not.toBeInTheDocument();
  });
});

import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { DiscoveredPlugin } from '../../lib/plugins';
import { PluginCards } from './PluginCards';

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const PINNED = '9f2c1a7e5b3d4c6f8a0b1c2d3e4f5a6b7c8d9e0f';

const gsBase: DiscoveredPlugin = {
  name: 'gs-base',
  repoUrl: 'https://github.com/giantswarm/claude-code',
  path: 'plugins/gs-base',
  ref: 'main',
  commit: HEAD,
  format: 'agent-plugins',
  skills: [
    { name: 'fluxcd', description: 'Flux CD at Giant Swarm.' },
    { name: 'registries', description: 'The OCI registries.' },
  ],
};

function renderCards(
  selected: { plugin: DiscoveredPlugin; skills: string[] }[],
) {
  const handlers = {
    onTogglePlugin: jest.fn(),
    onSelectAllPluginSkills: jest.fn(),
    onTogglePluginSkill: jest.fn(),
  };
  return {
    handlers,
    rendered: renderInTestApp(
      <PluginCards
        plugins={[gsBase]}
        catalog={[]}
        selected={selected}
        {...handlers}
      />,
    ),
  };
}

describe('PluginCards', () => {
  // An agent that picked gs-base while it was a Claude Code plugin carries it
  // without a selection, pinned to that commit, where it loads whole.
  it("shows an edited agent's whole-plugin entry as the plugin checked", async () => {
    const user = userEvent.setup();
    const { handlers, rendered } = renderCards([
      { plugin: { ...gsBase, commit: PINNED }, skills: [] },
    ]);
    await rendered;

    const plugin = screen.getByRole('checkbox', { name: 'Plugin gs-base' });
    expect(plugin).toBeChecked();
    expect(
      screen.getByText('Agent Plugins · Whole plugin, as pinned'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The agent loads it whole at its pinned commit\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/pinned at/)).toHaveTextContent(
      'pinned at 9f2c1a7 · main is at cb1fb76',
    );

    // Every skill loads, so none is picked or dropped on its own.
    await user.click(
      screen.getByRole('button', { name: 'Show skills of gs-base' }),
    );
    const skills = within(
      screen.getByRole('group', { name: 'Skills of plugin gs-base' }),
    ).getAllByRole('checkbox');
    expect(skills).toHaveLength(2);
    for (const skill of skills) {
      expect(skill).toBeChecked();
      expect(skill).toHaveAttribute('aria-disabled', 'true');
    }
    await user.click(skills[0]);
    expect(handlers.onTogglePluginSkill).not.toHaveBeenCalled();

    // Clearing the checkbox takes the entry off, so skills can be picked anew.
    await user.click(plugin);
    expect(handlers.onTogglePlugin).toHaveBeenCalledWith(gsBase);
    expect(handlers.onSelectAllPluginSkills).not.toHaveBeenCalled();
  });

  it('keeps a long package to one row until it is opened, and pages its skills', async () => {
    const big: DiscoveredPlugin = {
      ...gsBase,
      skills: Array.from({ length: 30 }, (_, i) => ({
        name: `skill-${String(i).padStart(2, '0')}`,
        description: 'A skill.',
      })),
    };
    const user = userEvent.setup();
    await renderInTestApp(
      <PluginCards
        plugins={[big]}
        catalog={[]}
        selected={[]}
        onTogglePlugin={jest.fn()}
        onSelectAllPluginSkills={jest.fn()}
        onTogglePluginSkill={jest.fn()}
      />,
    );

    expect(screen.queryByText('skill-00')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Show skills of gs-base' }),
    );
    expect(
      within(
        screen.getByRole('group', { name: 'Skills of plugin gs-base' }),
      ).getAllByRole('checkbox'),
    ).toHaveLength(20);
    expect(
      screen.getByRole('button', { name: 'Show 10 more skills' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Hide skills of gs-base' }),
    );
    expect(
      screen.queryByRole('group', { name: 'Skills of plugin gs-base' }),
    ).not.toBeInTheDocument();
  });
});

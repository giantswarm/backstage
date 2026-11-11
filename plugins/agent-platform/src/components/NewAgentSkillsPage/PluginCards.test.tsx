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
  plugins: DiscoveredPlugin[] = [gsBase],
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
        plugins={plugins}
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
    await user.click(screen.getByRole('button', { name: /^gs-base / }));
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
    await user.click(screen.getByRole('button', { name: /^gs-base / }));
    expect(
      within(
        screen.getByRole('group', { name: 'Skills of plugin gs-base' }),
      ).getAllByRole('checkbox'),
    ).toHaveLength(20);
    expect(
      screen.getByRole('button', { name: 'Show 10 more skills' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^gs-base / }));
    expect(
      screen.queryByRole('group', { name: 'Skills of plugin gs-base' }),
    ).not.toBeInTheDocument();
  });

  it('says that an entry without a selection at the commit shown loads nothing', async () => {
    const user = userEvent.setup();
    const { handlers, rendered } = renderCards([
      { plugin: gsBase, skills: [] },
    ]);
    await rendered;

    const plugin = screen.getByRole('checkbox', { name: 'Plugin gs-base' });
    expect(plugin).toBePartiallyChecked();
    expect(
      screen.getByText('Agent Plugins · No skills selected'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The agent's entry for it selects no skills, so the agent loads none of them.",
      ),
    ).toBeInTheDocument();
    await user.click(plugin);
    expect(handlers.onSelectAllPluginSkills).toHaveBeenCalledWith(gsBase);
  });

  it('counts the listed skills and names the ones the plugin no longer has', async () => {
    const { rendered } = renderCards([
      {
        plugin: { ...gsBase, commit: PINNED },
        skills: ['fluxcd', 'gone', 'older'],
      },
    ]);
    await rendered;

    expect(
      screen.getByText('Agent Plugins · 1 of 2 skills selected'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Also selected at its pinned commit, and no longer in the plugin: gone, older.',
      ),
    ).toBeInTheDocument();
  });

  it('clears a picked package that lists no skills any more', async () => {
    const empty = { ...gsBase, skills: [] };
    const user = userEvent.setup();
    const { handlers, rendered } = renderCards(
      [{ plugin: { ...empty, commit: PINNED }, skills: ['gone'] }],
      [empty],
    );
    await rendered;

    const plugin = screen.getByRole('checkbox', { name: 'Plugin gs-base' });
    expect(plugin).toBeEnabled();
    expect(
      screen.getByText('Agent Plugins · No skills in its skills directory'),
    ).toBeInTheDocument();
    await user.click(plugin);
    expect(handlers.onTogglePlugin).toHaveBeenCalledWith(empty);
    expect(handlers.onSelectAllPluginSkills).not.toHaveBeenCalled();
  });

  it('says what a Claude Code row loads when its pinned entry names skills', async () => {
    const commits: DiscoveredPlugin = {
      ...gsBase,
      name: 'commits',
      path: 'plugins/commits',
      format: 'claude-code',
      skills: [],
    };
    const { rendered } = renderCards(
      [{ plugin: { ...commits, commit: PINNED }, skills: ['style'] }],
      [commits],
    );
    await rendered;

    expect(
      screen.getByRole('checkbox', { name: 'Plugin commits' }),
    ).toBeChecked();
    expect(
      screen.getByText(
        /At its pinned commit it is an Agent Plugins package, and the agent loads only style\./,
      ),
    ).toBeInTheDocument();
  });

  it('keeps a row opened by hand open once a search is cleared', async () => {
    const user = userEvent.setup();
    const { rendered } = renderCards([]);
    await rendered;

    await user.click(screen.getByRole('button', { name: /^gs-base / }));
    expect(screen.getByText('fluxcd')).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Search plugins' });
    await user.type(search, 'registries');
    // The search opens the plugin at its matching skill alone.
    expect(screen.queryByText('fluxcd')).not.toBeInTheDocument();
    expect(screen.getByText('registries')).toBeInTheDocument();
    await user.clear(search);
    expect(screen.getByText('fluxcd')).toBeInTheDocument();
  });
});

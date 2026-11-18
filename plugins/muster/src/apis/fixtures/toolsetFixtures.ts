import type { FixtureToolsetPreset } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type { ToolSummary, ToolsetPreset } from '../types';

/** The presets every muster knows, besides its configured ones. */
export const BUILT_IN_FIXTURE_PRESETS: readonly ToolsetPreset[] = [
  {
    name: 'read-only',
    description:
      'Every tool its connector marks read-only, and every workflow whose steps only read.',
    built_in: true,
  },
  {
    name: 'none',
    description: 'No tools at all.',
    built_in: true,
  },
  {
    name: 'full',
    description: 'Everything the gateway exposes to the caller.',
    built_in: true,
  },
];

const SELECTOR = /^(preset|server|workflow|tool):([^\s,]+)$/;

/** A toolset's resolution: the tools it selects, and the selectors that select none. */
export type ToolsetResolution = { tools: ToolSummary[]; unmatched: string[] };

/**
 * Resolves a toolset within a catalogue, as muster's `filter_tools` does:
 * `preset:` expands a built-in or configured preset, `server:` takes the
 * server's tools, `workflow:` its `workflow_<name>` tool and `tool:` the tool
 * by its exposed name. A preset muster does not know, or a selector it
 * cannot parse, fails the request with muster's message.
 */
export function resolveToolset(
  selectors: readonly string[],
  catalogue: readonly ToolSummary[],
  presets: readonly FixtureToolsetPreset[],
): ToolsetResolution {
  const select = (selector: string, depth: number): ToolSummary[] => {
    const match = SELECTOR.exec(selector);
    if (!match) {
      throw Object.assign(new Error(`invalid toolset selector "${selector}"`), {
        status: 400,
      });
    }
    const [, kind, name] = match;
    switch (kind) {
      case 'server':
        return catalogue.filter(tool => tool.server === name);
      case 'workflow':
        return catalogue.filter(tool => tool.name === `workflow_${name}`);
      case 'tool':
        return catalogue.filter(tool => tool.name === name);
      default:
        break;
    }
    if (name === 'none') {
      return [];
    }
    if (name === 'full') {
      return [...catalogue];
    }
    if (name === 'read-only') {
      return catalogue.filter(
        tool => tool.kind !== 'core' && tool.annotations?.readOnlyHint === true,
      );
    }
    const preset = presets.find(p => p.name === name);
    if (!preset || depth > 4) {
      throw Object.assign(new Error(`unknown preset "${name}"`), {
        status: 400,
      });
    }
    return preset.selectors.flatMap(inner => select(inner, depth + 1));
  };
  const unmatched: string[] = [];
  const tools = new Map<string, ToolSummary>();
  for (const selector of selectors) {
    const selected = select(selector, 0);
    if (selected.length === 0 && selector !== 'preset:none') {
      unmatched.push(selector);
    }
    selected.forEach(tool => tools.set(tool.name, tool));
  }
  return {
    tools: catalogue.filter(tool => tools.has(tool.name)),
    unmatched,
  };
}

/** The presets an installation's muster lists: the built-in ones, then its own. */
export function presetsOf(
  presets: readonly FixtureToolsetPreset[],
): ToolsetPreset[] {
  return [
    ...BUILT_IN_FIXTURE_PRESETS,
    ...presets.map(({ name, description }) => ({ name, description })),
  ];
}

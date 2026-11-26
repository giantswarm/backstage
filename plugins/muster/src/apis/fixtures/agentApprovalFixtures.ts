import type { FixtureToolsetPreset } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  AgentToolsArgument,
  ToolApproval,
  ToolConnectorRef,
  ToolSummary,
} from '../types';
import { resolveToolset } from './toolsetFixtures';

/**
 * An agent's tool list reported the way muster's `filter_tools` reports it
 * with `agentTools` (tool approval, milestone 2; `contract-slice-3.md` §5):
 * the list's selectors narrow the catalogue, each tool carries the approval
 * that agent would get, with the deciding `entry` and the connector's own
 * setting (`admin`), and each server tool the connectors behind it. muster's
 * resolution, kept to what the data set needs: a grant lifts only an `ask`
 * the connector set (a tool's entry or its rule), never a built-in or a
 * governance one (decision #79).
 */

const SETTINGS = ['Allow', 'Ask', 'Block'] as const;
type AgentSetting = (typeof SETTINGS)[number];

const RANK: Record<ToolApproval['setting'], number> = {
  allow: 0,
  ask: 1,
  block: 2,
};

// `tool:` before `workflow:`, before `server:`, before `preset:`, before
// the list's default.
const SPECIFICITY = ['tool', 'workflow', 'server', 'preset'] as const;

type Entry = { selector: string; setting?: AgentSetting };

function refusal(message: string): Error {
  return Object.assign(new Error(message), { status: 422 });
}

/** The list's entries, checked as muster's `parseAgentTools` checks them. */
export function agentToolEntriesOf(agentTools: AgentToolsArgument): Entry[] {
  if (!Array.isArray(agentTools.tools) || agentTools.tools.length === 0) {
    throw refusal(
      'agentTools.tools must be a non-empty array of selectors or {selector: Allow|Ask|Block} objects',
    );
  }
  return agentTools.tools.map((item, index) => {
    if (typeof item === 'string') {
      return { selector: item };
    }
    const keys = Object.keys(item);
    if (keys.length !== 1) {
      throw refusal(
        `agentTools.tools[${index}] must have exactly one selector`,
      );
    }
    const [selector] = keys;
    const setting = item[selector];
    if (!(SETTINGS as readonly string[]).includes(setting)) {
      throw refusal(
        `agentTools: entry ${selector}: setting must be Allow, Ask or Block`,
      );
    }
    return { selector, setting: setting as AgentSetting };
  });
}

function lower(setting: AgentSetting): ToolApproval['setting'] {
  return setting.toLowerCase() as ToolApproval['setting'];
}

/**
 * The agent's setting for a tool and the entry that decided it: the most
 * specific kind of entry with a setting that selects the tool, the
 * strictest among entries of that kind, else the default.
 */
function agentSettingOf(
  tool: ToolSummary,
  entries: readonly Entry[],
  selects: (selector: string, tool: ToolSummary) => boolean,
  fallback: AgentSetting | undefined,
): { setting: AgentSetting; entry: string } | undefined {
  for (const kind of SPECIFICITY) {
    const matching = entries.filter(
      entry =>
        entry.setting !== undefined &&
        entry.selector.startsWith(`${kind}:`) &&
        selects(entry.selector, tool),
    );
    if (matching.length > 0) {
      const strictest = matching.reduce((a, b) =>
        RANK[lower(b.setting!)] > RANK[lower(a.setting!)] ? b : a,
      );
      return { setting: strictest.setting!, entry: strictest.selector };
    }
  }
  return fallback ? { setting: fallback, entry: 'default' } : undefined;
}

/** Where the connector's own setting may be lifted by a grant. */
const LIFTABLE: ReadonlySet<string> = new Set(['tool', 'connector']);

/** The approval a tool gets with the agent's settings and grants. */
export function agentApprovalOf(
  admin: ToolApproval,
  agent: { setting: AgentSetting; entry: string } | undefined,
  granted: boolean,
): ToolApproval {
  if (!agent) {
    return admin;
  }
  const decided = {
    entry: agent.entry,
    admin: { setting: admin.setting, source: admin.source },
  };
  const own = lower(agent.setting);
  if (admin.setting === 'block') {
    return { ...admin, ...decided };
  }
  if (own === 'block') {
    return { setting: 'block', source: 'agent', ...decided };
  }
  if (
    own === 'allow' &&
    admin.setting === 'ask' &&
    LIFTABLE.has(admin.source) &&
    granted
  ) {
    return { setting: 'allow', source: 'agent-exception', ...decided };
  }
  if (RANK[own] > RANK[admin.setting]) {
    return { setting: own, source: 'agent', ...decided };
  }
  return { ...admin, ...decided };
}

/**
 * The catalogue as an agent's tool list sees it: narrowed by the list's
 * selectors, every tool with the agent's approval and, for a server tool,
 * its connectors (`connectorsOf`).
 */
export function reportForAgent(
  catalogue: readonly ToolSummary[],
  agentTools: AgentToolsArgument,
  presets: readonly FixtureToolsetPreset[],
  connectorsOf: (tool: ToolSummary) => ToolConnectorRef[] | undefined,
): ToolSummary[] {
  const entries = agentToolEntriesOf(agentTools);
  const fallback = agentTools.default as AgentSetting | undefined;
  if (fallback !== undefined && !SETTINGS.includes(fallback)) {
    throw refusal('agentTools.default must be Allow, Ask or Block');
  }
  const listed = resolveToolset(
    entries.map(entry => entry.selector),
    catalogue,
    presets,
  ).tools;
  const presetMembers = new Map<string, Set<string>>();
  const selects = (selector: string, tool: ToolSummary): boolean => {
    const [kind, ...rest] = selector.split(':');
    const name = rest.join(':');
    switch (kind) {
      case 'tool':
        return tool.name === name;
      case 'workflow':
        return tool.name === `workflow_${name}`;
      case 'server':
        return tool.server === name;
      default: {
        let members = presetMembers.get(selector);
        if (!members) {
          members = new Set(
            resolveToolset([selector], catalogue, presets).tools.map(
              member => member.name,
            ),
          );
          presetMembers.set(selector, members);
        }
        return members.has(tool.name);
      }
    }
  };
  const grants = agentTools.grants ?? [];
  return listed.map(tool => {
    const admin: ToolApproval = tool.approval ?? {
      setting: 'allow',
      source: 'unreviewed',
    };
    const connectors = connectorsOf(tool);
    const agent = agentSettingOf(tool, entries, selects, fallback);
    const granted =
      agent !== undefined &&
      grants.some(
        grant =>
          grant.entry === agent.entry &&
          (connectors ?? []).some(
            connector =>
              connector.server === grant.server &&
              Boolean(grant.uid) &&
              connector.uid === grant.uid &&
              // A grant names the tools it covers; one without lifts nothing.
              Boolean(connector.tool) &&
              (grant.tools ?? []).includes(connector.tool!),
          ),
      );
    return {
      ...tool,
      approval: agentApprovalOf(admin, agent, granted),
      ...(connectors && { connectors }),
    };
  });
}

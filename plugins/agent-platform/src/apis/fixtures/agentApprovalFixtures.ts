// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- agent-manager asks muster which connectors an Allow needs a grant of.
import { musterAgentToolReportOf } from '@giantswarm/backstage-plugin-muster/fixtures';

import type {
  AgentApprovalGrant,
  AgentApprovalSetting,
  AgentToolEntry,
  DroppedApprovalGrant,
} from '../../lib/agentManager';
import {
  entrySelector,
  entrySetting,
  isApprovalSetting,
} from '../../lib/agentApproval';
import { SELECTOR_PATTERN } from '../../lib/toolset';
import { FIXTURE_USER } from './fixtureIdentity';

/**
 * agent-manager's tool approval in fixture mode (tool approval): the checks its write tools make on an agent's
 * tool list, the connector-admin check behind `set_agent_approval`, and the
 * grants a save keeps or drops. Which connectors an `Allow` lifts an `Ask`
 * of comes from muster's fixture, as agent-manager asks muster's
 * `filter_tools`; the guest is connector admin where muster's fixture says
 * so (muster's own namespace).
 */

/**
 * The installation whose agent-manager predates tool approval (the same
 * older one as `WITHOUT_CONNECTORS`): one `update_agent` takes everything,
 * `create_agent` takes `toolset`, and there is no `update_agent_access`,
 * `set_agent_approval` or `list_approval_grants`.
 */
export const WITHOUT_TOOL_APPROVAL = 'fennel';

export function takesToolApproval(installation: string): boolean {
  return installation !== WITHOUT_TOOL_APPROVAL;
}

/** The fields `update_agent` takes once agent-manager has tool approval. */
export const DESCRIBING_ARGS = [
  'displayName',
  'tags',
  'description',
  'systemMessage',
  'modelConfig',
  'iconUrl',
  'labels',
  'annotations',
];

/** The fields `set_agent_approval` takes. */
export const APPROVAL_ARGS = ['default', 'settings'];

/** The fields `update_agent_access` takes. */
export const ACCESS_ARGS = [
  'tools',
  'toolset',
  'harness',
  'skills',
  'plugins',
  'egress',
  'egressPolicyRefs',
  'connectors',
  'gitAuthSecretName',
  'refreshSkills',
  'defaultWorkspace',
  'defaultToolchains',
];

/**
 * The refusal of arguments another of the split update tools takes, as
 * agent-manager words it (`refuseOtherToolsArgs`).
 */
export function refuseOtherToolsArgs(
  tool: 'update_agent' | 'update_agent_access' | 'set_agent_approval',
  args: Record<string, unknown>,
): void {
  const owners = [
    { tool: 'update_agent', args: DESCRIBING_ARGS },
    { tool: 'update_agent_access', args: ACCESS_ARGS },
    { tool: 'set_agent_approval', args: APPROVAL_ARGS },
  ];
  const refused: string[] = [];
  for (const owner of owners) {
    if (owner.tool === tool) continue;
    for (const arg of owner.args) {
      if (args[arg] !== undefined) {
        refused.push(`${tool} does not take ${arg}: use ${owner.tool}`);
      }
    }
  }
  if (refused.length > 0) {
    throw new Error(
      `invalid_request: ${refused
        .sort()
        .join(
          '; ',
        )}. Since tool approval, update_agent changes what an agent is, update_agent_access what it can reach and set_agent_approval its approval settings`,
    );
  }
}

/** Its write tools' refusal, in agent-manager's words. */
function refusal(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

/** An entry of the list, checked as agent-manager's MCP schema checks it. */
export function toolListOf(raw: unknown): AgentToolEntry[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 32) {
    throw refusal(
      'invalid_request',
      'tools: must be a list of 1 to 32 entries',
    );
  }
  const seen = new Set<string>();
  return raw.map((item, index) => {
    let selector: string | undefined;
    if (typeof item === 'string') {
      selector = item;
    } else if (typeof item === 'object' && item !== null) {
      selector = Object.keys(item)[0];
    }
    const setting =
      typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>)[selector ?? '']
        : undefined;
    if (
      !selector ||
      !SELECTOR_PATTERN.test(selector) ||
      (typeof item === 'object' &&
        (Object.keys(item).length !== 1 || !isApprovalSetting(setting)))
    ) {
      throw refusal(
        'invalid_request',
        `tools[${index}]: must be a selector or {selector: Allow|Ask|Block}`,
      );
    }
    if (seen.has(selector)) {
      throw refusal('invalid_request', `tools: ${selector} is listed twice`);
    }
    seen.add(selector);
    return item as AgentToolEntry;
  });
}

type Connector = {
  server: string;
  uid?: string;
  admin: boolean;
  /** The connector's own names of the tools the entry lifts there. */
  tools: string[];
};

/**
 * The connectors each `Allow` entry (and an allowing default, as
 * `default`) needs a grant of: those of the tools it decides whose
 * connector asks.
 */
export function grantNeeds(
  installation: string,
  tools: readonly AgentToolEntry[],
  fallback: AgentApprovalSetting | undefined,
  only?: ReadonlySet<string>,
): Map<string, Connector[]> {
  const allowing = tools
    .filter(entry => entrySetting(entry) === 'Allow')
    .map(entrySelector)
    .concat(fallback === 'Allow' ? ['default'] : [])
    .filter(entry => !only || only.has(entry));
  const needs = new Map<string, Connector[]>();
  if (allowing.length === 0) {
    return needs;
  }
  const report = musterAgentToolReportOf(installation, {
    tools: [...tools],
    ...(fallback && { default: fallback }),
  });
  for (const tool of report) {
    const entry = tool.approval?.entry;
    if (
      !entry ||
      !allowing.includes(entry) ||
      tool.approval?.admin?.setting !== 'ask'
    ) {
      continue;
    }
    const list = needs.get(entry) ?? [];
    for (const connector of tool.connectors ?? []) {
      let known = list.find(other => other.server === connector.server);
      if (!known) {
        known = {
          server: connector.server,
          uid: connector.uid,
          admin: tool.connectorAdmin === true,
          tools: [],
        };
        list.push(known);
      }
      if (connector.tool && !known.tools.includes(connector.tool)) {
        known.tools.push(connector.tool);
      }
    }
    needs.set(entry, list);
  }
  return needs;
}

function settingsOf(
  tools: readonly AgentToolEntry[],
): Map<string, AgentApprovalSetting | undefined> {
  return new Map(
    tools.map(entry => [entrySelector(entry), entrySetting(entry)]),
  );
}

/**
 * `create_agent`'s and `update_agent_access`'s check: they never grant. An
 * allowing default is refused; an entry new or changed to `Allow` is
 * refused when it lifts a connector's `Ask`.
 */
export function refuseAllowOverAsk(
  installation: string,
  tool: string,
  before: readonly AgentToolEntry[],
  after: readonly AgentToolEntry[],
  fallback: AgentApprovalSetting | undefined,
  fallbackChanged: boolean,
): void {
  if (fallbackChanged && fallback === 'Allow') {
    throw refusal(
      'invalid_request',
      `${tool} does not take default: Allow: an allowing default is granted only by a connector admin with set_agent_approval`,
    );
  }
  const was = settingsOf(before);
  const changed = new Set(
    after
      .filter(
        entry =>
          entrySetting(entry) === 'Allow' &&
          was.get(entrySelector(entry)) !== 'Allow',
      )
      .map(entrySelector),
  );
  for (const [entry, connectors] of grantNeeds(
    installation,
    after,
    undefined,
    changed,
  )) {
    const names = connectors.map(connector => connector.server).join(', ');
    throw refusal(
      'invalid_request',
      `${tool} does not grant exceptions: ${entry}: Allow selects tools whose connector ${names} asks first; save the entry without a setting (or with Ask), then a connector admin of ${names} grants it with set_agent_approval`,
    );
  }
}

/**
 * What a save does to the grants: each kept only while its entry still
 * allows and the guest is connector admin of its connector, re-recorded as
 * the guest's; the rest dropped, with agent-manager's reason.
 */
export function settleGrants(
  installation: string,
  grants: readonly AgentApprovalGrant[],
  tools: readonly AgentToolEntry[],
  fallback: AgentApprovalSetting | undefined,
  generation: number,
): { kept: AgentApprovalGrant[]; dropped: DroppedApprovalGrant[] } {
  const settings = settingsOf(tools);
  const kept: AgentApprovalGrant[] = [];
  const dropped: DroppedApprovalGrant[] = [];
  const needs = grantNeeds(installation, tools, fallback);
  for (const grant of grants) {
    const allows =
      grant.entry === 'default'
        ? fallback === 'Allow'
        : settings.get(grant.entry) === 'Allow';
    if (!allows) {
      dropped.push({
        entry: grant.entry,
        server: grant.server,
        reason: 'entry removed or no longer Allow',
      });
      continue;
    }
    const admin = (needs.get(grant.entry) ?? []).find(
      connector => connector.server === grant.server,
    )?.admin;
    if (admin !== true) {
      dropped.push({
        entry: grant.entry,
        server: grant.server,
        reason: `saved by ${FIXTURE_USER.email}, not a connector admin of ${grant.server}`,
      });
      continue;
    }
    kept.push(recorded(grant, generation));
  }
  return { kept, dropped };
}

function recorded(
  grant: Pick<
    AgentApprovalGrant,
    'entry' | 'server' | 'namespace' | 'connectorUid' | 'tools'
  >,
  generation: number,
): AgentApprovalGrant {
  return {
    entry: grant.entry,
    server: grant.server,
    ...(grant.tools && { tools: [...grant.tools] }),
    ...(grant.namespace && { namespace: grant.namespace }),
    ...(grant.connectorUid && { connectorUid: grant.connectorUid }),
    grantedBy: FIXTURE_USER.email,
    grantedAt: new Date().toISOString(),
    generation,
  };
}

/**
 * `set_agent_approval`'s grants: for each entry the call names that lifts a
 * connector's `Ask`, one per connector, after the connector-admin check; one
 * refusal refuses the whole call.
 */
export function grantsOfApproval(
  installation: string,
  tools: readonly AgentToolEntry[],
  fallback: AgentApprovalSetting | undefined,
  named: ReadonlySet<string>,
  generation: number,
): AgentApprovalGrant[] {
  const grants: AgentApprovalGrant[] = [];
  for (const [entry, connectors] of grantNeeds(
    installation,
    tools,
    fallback,
    named,
  )) {
    for (const connector of connectors) {
      if (!connector.admin) {
        throw refusal(
          'forbidden',
          `allowing ${entry} over the Ask of connector ${connector.server} needs a connector admin of it (update mcpservers in namespace ${connector.server.includes('/') ? connector.server.split('/')[0] : 'muster'}); ask one to grant it with set_agent_approval`,
        );
      }
      grants.push(
        recorded(
          {
            entry,
            server: connector.server,
            connectorUid: connector.uid,
            tools: connector.tools,
          },
          generation,
        ),
      );
    }
  }
  return grants;
}

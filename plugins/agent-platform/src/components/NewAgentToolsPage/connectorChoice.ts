import { toolEffect } from '@giantswarm/backstage-plugin-muster';

import {
  type CatalogueGroup,
  EXCLUSIVE_PRESETS,
  MAX_INLINE_SELECTORS,
  parseSelector,
  PRESET_FULL,
  selectorForTool,
  type ServerBucket,
  serverSelector,
} from '../../lib/toolset';

/**
 * The Tools step's presentation of the toolset (T81). The model stays the
 * selector list; these helpers only read it as the step's three parts — the
 * access level (a radio), the per-connector choice of *Which apps?*, and the
 * picks the catalogue makes — and write a user's choice back into it.
 */

/** The access level *Nothing outside the chat*: no tools, selection off. */
export const ACCESS_CHAT_ONLY = 'chat-only';
/** The access level without a preset: only what is picked below. */
export const ACCESS_OWN_PICKS = 'own-picks';

/** A preset selector, {@link ACCESS_OWN_PICKS} or {@link ACCESS_CHAT_ONLY}. */
export type AccessLevel = string;

function isPresetSelector(selector: string): boolean {
  return parseSelector(selector)?.kind === 'preset';
}

/**
 * The access level a toolset shows as. One offered preset is that preset —
 * the base the picks below add to. No preset, several (combinable on the
 * model, not on a radio) or one the environment does not offer is *only the
 * tools I choose*: the presets then stay visible where the selection is
 * listed, and nothing is rewritten until the author picks a level.
 */
export function accessLevelOf(
  toolset: readonly string[],
  chatOnly: boolean,
  offered: ReadonlySet<string>,
): AccessLevel {
  if (chatOnly) {
    return ACCESS_CHAT_ONLY;
  }
  const presets = toolset.filter(isPresetSelector);
  return presets.length === 1 && offered.has(presets[0])
    ? presets[0]
    : ACCESS_OWN_PICKS;
}

/**
 * The toolset after picking an access level (never *Nothing outside the
 * chat*, which clears it): the presets give way to the picked one, and the
 * picks below stay — except under *Full gateway*, which holds every tool and
 * so stands alone (`EXCLUSIVE_PRESETS`).
 */
export function withAccessLevel(
  toolset: readonly string[],
  level: AccessLevel,
): string[] {
  const picks = toolset.filter(selector => !isPresetSelector(selector));
  if (level === ACCESS_OWN_PICKS || level === ACCESS_CHAT_ONLY) {
    return picks;
  }
  if (EXCLUSIVE_PRESETS.has(level)) {
    return [level];
  }
  return [level, ...picks];
}

/** Whether the step's selection below the access level is turned off. */
export function isSelectionOff(level: AccessLevel): boolean {
  return level === ACCESS_CHAT_ONLY || level === PRESET_FULL;
}

/** Every connector of the catalogue, by name: the *Which apps?* grid. */
export function connectorsOf(
  groups: readonly CatalogueGroup[],
): ServerBucket[] {
  return groups
    .flatMap(group => group.servers)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The connector's read-only tools as tool selectors, in name order. There is
 * no selector for "the read-only tools of x" (toolset selectors only union),
 * so read-only access to a connector is the list of its tools that read today
 * — a frozen list, unlike `server:x`.
 */
export function readOnlySelectors(bucket: ServerBucket): string[] {
  return bucket.tools
    .filter(tool => toolEffect(tool) === 'reads')
    .map(selectorForTool);
}

/** Whether read-only access to a connector fits inline at all. */
export function readOnlyFits(bucket: ServerBucket): boolean {
  return readOnlySelectors(bucket).length <= MAX_INLINE_SELECTORS;
}

export type ConnectorChoice = 'none' | 'read-only' | 'all' | 'partial';

export type ConnectorState = {
  choice: ConnectorChoice;
  /** How many of the connector's listed tools are picked one by one. */
  picked: number;
};

/**
 * How a connector stands in the toolset: *all* (`server:x`), *read-only*
 * (exactly its read-only tools, one by one), *partial* (any other picks —
 * neither option is shown as chosen, the count says what is) or *none*.
 */
export function connectorState(
  bucket: ServerBucket,
  selected: ReadonlySet<string>,
): ConnectorState {
  const picked = bucket.tools.filter(tool =>
    selected.has(selectorForTool(tool)),
  ).length;
  if (selected.has(serverSelector(bucket.name))) {
    return { choice: 'all', picked };
  }
  if (picked === 0) {
    return { choice: 'none', picked };
  }
  const readOnly = readOnlySelectors(bucket);
  const isReadOnly =
    readOnly.length === picked &&
    readOnly.every(selector => selected.has(selector));
  return { choice: isReadOnly ? 'read-only' : 'partial', picked };
}

/**
 * The toolset after a connector's choice: whatever named the connector before
 * (its `server:` selector and its tools picked one by one) gives way to the
 * new choice — *read-only* its read-only tools, *all* `server:x`, *none*
 * nothing. Everything else stays where it was. Adding to *Full gateway*
 * drops it, as everywhere (`EXCLUSIVE_PRESETS`).
 */
export function withConnectorChoice(
  toolset: readonly string[],
  bucket: ServerBucket,
  choice: Exclude<ConnectorChoice, 'partial'>,
): string[] {
  const own = new Set([
    serverSelector(bucket.name),
    ...bucket.tools.map(selectorForTool),
  ]);
  const rest = toolset.filter(selector => !own.has(selector));
  if (choice === 'none') {
    return rest;
  }
  const kept = rest.filter(selector => !EXCLUSIVE_PRESETS.has(selector));
  return choice === 'all'
    ? [...kept, serverSelector(bucket.name)]
    : [...kept, ...readOnlySelectors(bucket)];
}

/** Where a selected selector is listed on the Selected rail. */
export type RailGroup = {
  key: string;
  title: string;
  /** A connector's *All*: `server:x`, which follows tools it adds later. */
  whole?: string;
  selectors: string[];
};

const PRESETS_KEY = 'presets';
const WORKFLOWS_KEY = 'workflows';
const ADMINISTRATION_KEY = 'platform-administration';
const OTHER_KEY = 'other';

/**
 * The selection as the rail lists it: presets first, then each connector
 * with its `server:` selector or the tools picked from it, then workflows,
 * muster's own tools, and whatever names nothing the catalogue lists. In
 * selection order within a group.
 */
export function railGroups(
  toolset: readonly string[],
  groups: readonly CatalogueGroup[],
): RailGroup[] {
  const owner = new Map<string, string>();
  const connectorNames = new Set<string>();
  for (const group of groups) {
    for (const bucket of group.servers) {
      connectorNames.add(bucket.name);
      for (const tool of bucket.tools) {
        owner.set(selectorForTool(tool), bucket.name);
      }
    }
    for (const tool of group.platformAdministration) {
      owner.set(selectorForTool(tool), ADMINISTRATION_KEY);
    }
  }

  const byKey = new Map<string, RailGroup>();
  const at = (key: string, title: string): RailGroup => {
    const existing = byKey.get(key);
    if (existing) {
      return existing;
    }
    const created: RailGroup = { key, title, selectors: [] };
    byKey.set(key, created);
    return created;
  };

  for (const selector of toolset) {
    const parsed = parseSelector(selector);
    if (parsed?.kind === 'preset') {
      at(PRESETS_KEY, 'Access').selectors.push(selector);
    } else if (parsed?.kind === 'server' && connectorNames.has(parsed.name)) {
      at(`connector:${parsed.name}`, parsed.name).whole = selector;
    } else if (parsed?.kind === 'workflow') {
      at(WORKFLOWS_KEY, 'Workflows').selectors.push(selector);
    } else {
      const name = owner.get(selector);
      if (name === ADMINISTRATION_KEY) {
        at(ADMINISTRATION_KEY, 'Platform administration').selectors.push(
          selector,
        );
      } else if (name) {
        at(`connector:${name}`, name).selectors.push(selector);
      } else {
        at(OTHER_KEY, 'Other').selectors.push(selector);
      }
    }
  }

  const rank = (key: string) => {
    if (key === PRESETS_KEY) return 0;
    if (key.startsWith('connector:')) return 1;
    if (key === WORKFLOWS_KEY) return 2;
    if (key === ADMINISTRATION_KEY) return 3;
    return 4;
  };
  return [...byKey.values()].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.title.localeCompare(b.title),
  );
}

/**
 * A tool selector as the rail shows it under its connector: the tool's name
 * without the `tool:` kind or the `x_<connector>_` prefix muster gives it.
 */
export function railToolLabel(selector: string, connector?: string): string {
  const parsed = parseSelector(selector);
  if (!parsed || parsed.kind === 'preset') {
    return selector;
  }
  if (parsed.kind === 'workflow') {
    return parsed.name;
  }
  if (parsed.kind === 'tool' && connector) {
    const prefix = `x_${connector}_`;
    if (parsed.name.startsWith(prefix)) {
      return parsed.name.slice(prefix.length);
    }
  }
  return parsed.kind === 'tool' ? parsed.name : selector;
}

/**
 * Whether the selection holds something the access level and *Which apps?*
 * cannot show — several presets or one not offered, tools picked one by one
 * short of a connector's read-only set, workflows, muster's own tools, or
 * selectors naming nothing listed. The step then opens the individual tools,
 * so an edited agent's toolset is shown as it is rather than rewritten.
 */
export function needsIndividualTools(
  toolset: readonly string[],
  groups: readonly CatalogueGroup[],
  level: AccessLevel,
): boolean {
  const selected = new Set(toolset);
  const buckets = new Map(
    connectorsOf(groups).map(bucket => [bucket.name, bucket] as const),
  );
  return railGroups(toolset, groups).some(group => {
    if (group.key === PRESETS_KEY) {
      return level === ACCESS_OWN_PICKS;
    }
    if (group.key.startsWith('connector:')) {
      const bucket = buckets.get(group.title);
      return !bucket || connectorState(bucket, selected).choice === 'partial';
    }
    return true;
  });
}

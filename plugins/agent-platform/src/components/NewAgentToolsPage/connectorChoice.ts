import {
  toolEffect,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';

import {
  bucketLabel,
  type CatalogueGroup,
  EXCLUSIVE_PRESETS,
  MAX_INLINE_SELECTORS,
  parseSelector,
  presetNameOf,
  PRESET_FULL,
  selectorForTool,
  type ServerBucket,
  serverSelector,
} from '../../lib/toolset';

/**
 * The Tools step's presentation of the toolset (T81, T81b). The model stays
 * the selector list; these helpers read it as the step's parts — the access
 * level (a radio), the per-connector choice of *Which apps?*, and the picks
 * the catalogue makes — and write a person's choice back into it.
 *
 * A preset is a macro over the selection (T81b): while the toolset is just
 * `[preset:x]`, the grid and the catalogue show what it resolves to
 * ({@link materialize}); a change below applies to that, the radio reads
 * *Only the tools I choose below*, and the toolset is stored as compactly as
 * selectors allow (B1, {@link compactSelection}): the preset plus what was
 * added while everything it covers is still chosen, else written out.
 */

/** The access level *Nothing outside the chat*: no tools, selection off. */
export const ACCESS_CHAT_ONLY = 'chat-only';
/** The access level without a preset: only what is picked below. */
export const ACCESS_OWN_PICKS = 'own-picks';

/** A preset selector, {@link ACCESS_OWN_PICKS} or {@link ACCESS_CHAT_ONLY}. */
export type AccessLevel = string;

/**
 * The access level a toolset shows as: an offered preset when the toolset is
 * that preset alone. Anything else — no preset, a preset with more beside it
 * (the T81 shape), several, or one the environment does not offer — is *only
 * the tools I choose*, every selector shown and none rewritten until the
 * person acts.
 */
export function accessLevelOf(
  toolset: readonly string[],
  chatOnly: boolean,
  offered: ReadonlySet<string>,
): AccessLevel {
  if (chatOnly) {
    return ACCESS_CHAT_ONLY;
  }
  return toolset.length === 1 && offered.has(toolset[0])
    ? toolset[0]
    : ACCESS_OWN_PICKS;
}

/** Whether a level is a preset (not chat-only, not own picks). */
export function isPresetLevel(level: AccessLevel): boolean {
  return level !== ACCESS_CHAT_ONLY && level !== ACCESS_OWN_PICKS;
}

/**
 * Whether the selection below the radio is turned off: under *Nothing
 * outside the chat*, and under *Full gateway* — it holds every tool, and
 * written out it would rarely fit the inline cap, so it is not a starting
 * point to edit from.
 */
export function isSelectionOff(level: AccessLevel): boolean {
  return level === ACCESS_CHAT_ONLY || level === PRESET_FULL;
}

/** Every connector of the catalogue, by name: the *Which apps?* grid. */
export function connectorsOf(
  groups: readonly CatalogueGroup[],
): ServerBucket[] {
  return groups
    .flatMap(group => group.servers)
    .sort(
      (a, b) =>
        bucketLabel(a).localeCompare(bucketLabel(b)) ||
        a.name.localeCompare(b.name),
    );
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
  /** `connector:<name>` for a connector, with the name `server:` selects. */
  key: string;
  /** What the rail heads the group with: a connector's display name. */
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
  const connectorLabels = new Map<string, string>();
  for (const group of groups) {
    for (const bucket of group.servers) {
      connectorLabels.set(bucket.name, bucketLabel(bucket));
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
    } else if (parsed?.kind === 'server' && connectorLabels.has(parsed.name)) {
      at(`connector:${parsed.name}`, connectorLabels.get(parsed.name)!).whole =
        selector;
    } else if (parsed?.kind === 'workflow') {
      at(WORKFLOWS_KEY, 'Workflows').selectors.push(selector);
    } else {
      const name = owner.get(selector);
      if (name === ADMINISTRATION_KEY) {
        at(ADMINISTRATION_KEY, 'Platform tools').selectors.push(selector);
      } else if (name) {
        at(
          `connector:${name}`,
          connectorLabels.get(name) ?? name,
        ).selectors.push(selector);
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

/**
 * A preset's resolution written out as the selectors the grid and the
 * catalogue would show for it: per connector its read-only tools when that is
 * exactly what the preset covers there, `server:x` when it covers every tool
 * the connector lists (so tools it adds later too, as a preset by label
 * would), else the covered tools one by one; then the workflows, muster's own
 * tools and anything no connector lists, as `workflow:` / `tool:` selectors.
 */
export function materialize(
  resolved: readonly ToolSummary[],
  groups: readonly CatalogueGroup[],
): string[] {
  const covered = new Set(resolved.map(selectorForTool));
  const accounted = new Set<string>();
  const out: string[] = [];
  for (const bucket of connectorsOf(groups)) {
    const all = bucket.tools.map(selectorForTool);
    const hits = all.filter(selector => covered.has(selector));
    if (hits.length === 0) {
      continue;
    }
    hits.forEach(selector => accounted.add(selector));
    const readOnly = readOnlySelectors(bucket);
    if (
      readOnly.length === hits.length &&
      readOnly.every(selector => covered.has(selector))
    ) {
      out.push(...readOnly);
    } else if (hits.length === all.length) {
      out.push(serverSelector(bucket.name));
    } else {
      out.push(...hits);
    }
  }
  for (const tool of resolved) {
    const selector = selectorForTool(tool);
    if (!accounted.has(selector)) {
      accounted.add(selector);
      out.push(selector);
    }
  }
  return out;
}

/** Each listed tool's selector, by the connector that lists it. */
function connectorOfSelector(
  groups: readonly CatalogueGroup[],
): Map<string, string> {
  const owner = new Map<string, string>();
  for (const bucket of connectorsOf(groups)) {
    for (const tool of bucket.tools) {
      owner.set(selectorForTool(tool), bucket.name);
    }
  }
  return owner;
}

/**
 * The preset a toolset is built on (B1): its one preset selector, when the
 * environment offers it and it is not *Full gateway* — whether it stands alone
 * or with selectors beside it. Several presets, or one not offered, have no
 * base the step can write out, and are shown as they are.
 */
export function presetBaseOf(
  toolset: readonly string[],
  offered: ReadonlySet<string>,
): string | undefined {
  const presets = toolset.filter(
    selector => presetNameOf(selector) !== undefined,
  );
  return presets.length === 1 &&
    offered.has(presets[0]) &&
    !EXCLUSIVE_PRESETS.has(presets[0])
    ? presets[0]
    : undefined;
}

/**
 * The selection a preset-based toolset shows as: the preset written out
 * ({@link materialize}) with the selectors beside it added on top — a
 * `server:x` replacing what the preset covers of x, any other selector added
 * unless a `server:` already holds it. Toolset selectors only union, so this
 * is exactly what the toolset selects.
 */
export function expandSelection(
  coverage: readonly string[],
  extras: readonly string[],
  groups: readonly CatalogueGroup[],
): string[] {
  const owner = connectorOfSelector(groups);
  const connectors = new Set(connectorsOf(groups).map(bucket => bucket.name));
  let out = [...coverage];
  for (const selector of extras) {
    const parsed = parseSelector(selector);
    if (parsed?.kind === 'server' && connectors.has(parsed.name)) {
      out = out.filter(
        entry => entry !== selector && owner.get(entry) !== parsed.name,
      );
      out.push(selector);
      continue;
    }
    const connector = owner.get(selector);
    if (
      !out.includes(selector) &&
      !(connector && out.includes(serverSelector(connector)))
    ) {
      out.push(selector);
    }
  }
  return out;
}

/**
 * The cheapest toolset for a selection (B1). Selectors only union, so a
 * preset can stay the base while the selection still holds everything it
 * covers: the toolset is then the preset plus what the selection adds — a
 * `server:x` the preset does not already hold whole, and the tools it does not
 * cover. A selection that leaves out part of the preset cannot keep it ("the
 * preset minus x" has no selector), so it is written out as it is: `server:x`
 * per whole connector, a read-only choice as its read-only tools (no inline
 * selector means "the read-only tools of x"), the rest tool by tool.
 */
export function compactSelection(
  selection: readonly string[],
  base: { preset: string; resolved: readonly ToolSummary[] } | undefined,
  groups: readonly CatalogueGroup[],
): string[] {
  if (!base || selection.some(selector => EXCLUSIVE_PRESETS.has(selector))) {
    return [...selection];
  }
  const owner = connectorOfSelector(groups);
  const chosen = new Set(selection);
  const holds = (selector: string) => {
    const connector = owner.get(selector);
    return (
      chosen.has(selector) ||
      (connector !== undefined && chosen.has(serverSelector(connector)))
    );
  };
  const covered = new Set(base.resolved.map(selectorForTool));
  if (![...covered].every(holds)) {
    return [...selection];
  }
  const whole = new Set(
    materialize(base.resolved, groups).filter(
      selector => parseSelector(selector)?.kind === 'server',
    ),
  );
  const rest = selection.filter(
    selector =>
      selector !== base.preset &&
      !covered.has(selector) &&
      !whole.has(selector),
  );
  // An empty or tiny coverage is no saving: the preset is kept only when it
  // costs no more than writing the selection out.
  return rest.length + 1 <= selection.length
    ? [base.preset, ...rest]
    : [...selection];
}

const CAP_CONTRIBUTORS = 3;

/** A rail group in running text: a connector by its name, the rest in words. */
function contributorName(group: RailGroup): string {
  if (group.key.startsWith('connector:')) {
    return group.title;
  }
  return group.key === OTHER_KEY
    ? 'other selectors'
    : group.title.toLowerCase();
}

/**
 * Why a toolset over the inline cap cannot be applied, naming what to reduce:
 * the connectors (or workflows, or other selectors) that list the most.
 */
export function inlineCapProblem(
  toolset: readonly string[],
  groups: readonly CatalogueGroup[],
): string {
  const contributors = railGroups(toolset, groups)
    .filter(group => group.key !== PRESETS_KEY)
    .map(group => ({
      name: contributorName(group),
      count: group.selectors.length + (group.whole ? 1 : 0),
    }))
    .filter(entry => entry.count > 1)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, CAP_CONTRIBUTORS);
  const need = `This toolset needs ${toolset.length} selectors but may list at most ${MAX_INLINE_SELECTORS}`;
  if (contributors.length === 0) {
    return `${need}, so choose fewer connectors or tools.`;
  }
  const names = contributors.map(entry => `${entry.name} (${entry.count})`);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${need}; most come from ${list}, so choose All or fewer tools there.`;
}

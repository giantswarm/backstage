/**
 * What an agent's toolset lets it reach, in words (T103): per connector, by
 * the coverage the Tools step's grid shows for it — all of its tools, exactly
 * its read-only tools, or some of them — never as raw tool ids.
 *
 * Pure, so the composer's reach line and the agent page's Connectors section
 * agree by construction and every rule is testable without a DOM.
 */

import {
  joinNames,
  NAMED_IN_SENTENCE,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  connectorsOf,
  connectorState,
} from '../components/NewAgentToolsPage/connectorChoice';
import {
  type CatalogueGroup,
  countNoun,
  type DeclaredToolset,
  isCoreTool,
  parseSelector,
  selectorForTool,
  serverSelector,
  toolsetShape,
} from './toolset';

/** How a shipped preset reads mid-sentence; `none` adds nothing. */
const PRESET_PHRASES: Record<string, string> = {
  'read-only': 'read-only tools',
  none: '',
  full: 'every tool the gateway exposes',
  infrastructure: 'the Infrastructure tools',
  'agent-platform': 'the Agent Platform tools',
};

/**
 * A preset as running text names it: a shipped one by its phrase, an
 * installation's own as "the <name> preset". Empty for `none`.
 */
export function presetPhrase(name: string): string {
  return PRESET_PHRASES[name] ?? `the ${name} preset`;
}

/** What a toolset reaches, sorted by the verb the sentence gives it. */
export type ToolsetReach = {
  /** Used whole: presets and connectors with every tool. */
  uses: string[];
  /** Connectors whose read-only tools, and only those, are chosen. */
  readsFrom: string[];
  /** Connectors with any other pick of their tools. */
  someFrom: string[];
  /**
   * Phrases that say their own coverage, after the connectors: platform
   * tools, workflows and tools only counted.
   */
  alsoUses: string[];
};

/**
 * Sorts a composed toolset's selectors by connector coverage. With `groups`
 * (the caller's catalogue, as the Tools step builds it) each connector is
 * classified the way the grid shows it (`connectorState`); a connector whose
 * every listed tool is picked one by one counts as whole. Without it, only
 * what the selectors themselves say is named — presets, whole connectors and
 * workflows — and individually picked tools are counted, since which
 * connector they belong to and how much of it they cover is not known.
 */
export function toolsetReach(
  selectors: readonly string[],
  groups?: readonly CatalogueGroup[],
): ToolsetReach {
  const selected = new Set(selectors);
  const accounted = new Set<string>();
  const presets: string[] = [];
  const connectors: string[] = [];
  const readsFrom: string[] = [];
  const someFrom: string[] = [];

  for (const bucket of groups ? connectorsOf(groups) : []) {
    const { choice, picked } = connectorState(bucket, selected);
    if (choice === 'none') {
      continue;
    }
    accounted.add(serverSelector(bucket.name));
    bucket.tools.forEach(tool => accounted.add(selectorForTool(tool)));
    if (choice === 'all' || picked === bucket.tools.length) {
      connectors.push(bucket.name);
    } else if (choice === 'read-only') {
      readsFrom.push(bucket.name);
    } else {
      someFrom.push(bucket.name);
    }
  }

  const platformTools = (groups ?? []).flatMap(
    group => group.platformAdministration,
  );
  const platformPicked = platformTools.filter(tool =>
    selected.has(selectorForTool(tool)),
  ).length;
  platformTools.forEach(tool => accounted.add(selectorForTool(tool)));

  const workflows: string[] = [];
  let unlistedPlatform = 0;
  let tools = 0;
  for (const selector of selectors) {
    if (accounted.has(selector)) {
      continue;
    }
    const parsed = parseSelector(selector);
    if (parsed?.kind === 'preset') {
      const phrase = presetPhrase(parsed.name);
      if (phrase) {
        presets.push(phrase);
      }
    } else if (parsed?.kind === 'server') {
      connectors.push(parsed.name);
    } else if (parsed?.kind === 'workflow') {
      workflows.push(parsed.name);
    } else if (groups && parsed && isCoreTool({ name: parsed.name })) {
      unlistedPlatform += 1;
    } else {
      tools += 1;
    }
  }

  const alsoUses: string[] = [];
  if (platformPicked > 0 || unlistedPlatform > 0) {
    alsoUses.push(
      platformPicked === platformTools.length && unlistedPlatform === 0
        ? 'platform tools'
        : 'some platform tools',
    );
  }
  if (workflows.length === 1) {
    alsoUses.push(`the ${workflows[0]} workflow`);
  } else if (workflows.length > 1) {
    alsoUses.push(countNoun(workflows.length, 'workflow'));
  }
  if (tools > 0) {
    // With a catalogue these name nothing it lists (a connector the person
    // has not signed in to, a renamed tool); without one, nothing is known.
    alsoUses.push(countNoun(tools, groups ? 'other tool' : 'selected tool'));
  }
  return { uses: [...presets, ...connectors], readsFrom, someFrom, alsoUses };
}

/**
 * How many names each list may show: {@link NAMED_IN_SENTENCE} across the
 * whole sentence, at least one per list, the rest handed out in sentence
 * order.
 */
function shares(lengths: number[]): number[] {
  const present = lengths.filter(length => length > 0).length;
  let budget = Math.max(NAMED_IN_SENTENCE, present) - present;
  return lengths.map(length => {
    if (length === 0) {
      return 0;
    }
    const extra = Math.min(length - 1, budget);
    budget -= extra;
    return 1 + extra;
  });
}

/** `a`, `a and b`, `a, b and c`, or past `max` `a, b and 3 more`. */
function nameList(names: readonly string[], max: number): string {
  if (names.length > max) {
    return joinNames(names, { max });
  }
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Clauses of one sentence; a serial comma once any of them lists with "and". */
function clauseList(clauses: string[], serial: boolean): string {
  if (clauses.length <= 1) {
    return clauses.join('');
  }
  const last = clauses[clauses.length - 1];
  const head = clauses.slice(0, -1).join(', ');
  return serial ? `${head}, and ${last}` : `${head} and ${last}`;
}

/**
 * The reach as one sentence: "Can use kubernetes, read from github and use
 * some tools from cluster-manager." Without read-only coverage the uses
 * share one verb: "Can use kubernetes and some tools from cluster-manager."
 */
export function reachSentence({
  uses,
  readsFrom,
  someFrom,
  alsoUses,
}: ToolsetReach): string | undefined {
  const [useMax, readMax, someMax] = shares([
    uses.length,
    readsFrom.length,
    someFrom.length,
  ]);
  const used = nameList(uses, useMax);
  const read = nameList(readsFrom, readMax);
  const some = someFrom.length
    ? `some tools from ${nameList(someFrom, someMax)}`
    : '';
  const serial = [uses, readsFrom, someFrom].some(names => names.length > 1);

  const clauses: string[] = [];
  if (!read) {
    const parts = [used, some, ...alsoUses].filter(Boolean);
    if (parts.length > 0) {
      clauses.push(`use ${clauseList(parts, serial)}`);
    }
  } else {
    const parts = [used, ...alsoUses].filter(Boolean);
    if (parts.length > 0) {
      clauses.push(`use ${clauseList(parts, serial)}`);
    }
    clauses.push(`read from ${read}`);
    if (some) {
      clauses.push(`use ${some}`);
    }
  }
  if (clauses.length === 0) {
    return undefined;
  }
  return `Can ${clauseList(clauses, serial)}.`;
}

/**
 * What an agent's declared toolset lets it reach, as one sentence, or
 * `undefined` when the toolset is not known. `groups` is the caller's
 * catalogue; without it, individually picked tools are only counted.
 */
export function describeReach(
  toolset: DeclaredToolset | undefined,
  groups?: readonly CatalogueGroup[],
): string | undefined {
  if (!toolset || toolset.state === 'unresolved') {
    return undefined;
  }
  if (toolset.state === 'no-gateway') {
    return 'Has no connectors.';
  }
  if (toolset.state === 'implicit-full') {
    return 'Can use every connector you can.';
  }
  switch (toolsetShape(toolset.selectors)) {
    case 'none':
      return 'Has no connectors.';
    case 'full':
      return 'Can use every connector you can.';
    default:
      return (
        reachSentence(toolsetReach(toolset.selectors, groups)) ??
        'Has no connectors.'
      );
  }
}

/** Whether naming the reach needs the catalogue: a tool picked one by one. */
export function reachNeedsCatalogue(
  toolset: DeclaredToolset | undefined,
): boolean {
  return (
    toolset?.state === 'declared' &&
    toolset.selectors.some(selector => parseSelector(selector)?.kind === 'tool')
  );
}

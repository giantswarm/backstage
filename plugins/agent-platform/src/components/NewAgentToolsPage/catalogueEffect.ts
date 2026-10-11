import {
  TOOL_EFFECT_LABELS,
  toolEffect,
  type ToolEffect,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';
import type { CatalogFilterDimension } from '@giantswarm/backstage-plugin-ui-react';

import { type CatalogueGroup, hasEntries } from '../../lib/toolset';

/** The catalogue's effect filter: everything, or only one kind of tool. */
export type EffectFilter = 'all' | ToolEffect;

export const EFFECT_FILTER_ID = 'effect';

/** Every pickable entry of the catalogue: server tools, muster's own, workflows. */
function catalogueTools(groups: CatalogueGroup[]): ToolSummary[] {
  return groups.flatMap(group => [
    ...group.servers.flatMap(bucket => bucket.tools),
    ...group.platformAdministration,
    ...group.workflows,
  ]);
}

/** How many of the catalogue's entries only read, and how many change things. */
export function effectCounts(
  groups: CatalogueGroup[],
): Record<ToolEffect, number> {
  const counts: Record<ToolEffect, number> = { reads: 0, changes: 0 };
  for (const tool of catalogueTools(groups)) {
    counts[toolEffect(tool)] += 1;
  }
  return counts;
}

/**
 * Narrows the catalogue to one kind of tool, keeping its grouping (like the
 * search, `filterCatalogue`). A tool reads only when its server annotates it
 * read-only (`toolEffect`); a workflow carries muster's derived annotation. A
 * server keeps the tools of that kind; one with none — a sign-in-gated server
 * among them, whose tools are not known yet — drops out until All is picked
 * again. Empty groups disappear.
 */
export function filterCatalogueByEffect(
  groups: CatalogueGroup[],
  effect: EffectFilter,
): CatalogueGroup[] {
  if (effect === 'all') {
    return groups;
  }
  const keep = (tool: ToolSummary) => toolEffect(tool) === effect;
  return groups
    .map(group => ({
      ...group,
      servers: group.servers
        .map(bucket => ({ ...bucket, tools: bucket.tools.filter(keep) }))
        .filter(bucket => bucket.tools.length > 0),
      platformAdministration: group.platformAdministration.filter(keep),
      workflows: group.workflows.filter(keep),
    }))
    .filter(hasEntries);
}

/**
 * The effect filter as a filter-bar facet — a "What it does" dropdown of
 * "Reads 31" and "Changes things 9" (T49, T64): drawn only when the whole
 * catalogue holds both kinds, or while a kind is picked so the pick can be
 * undone. Counts are over the searched catalogue.
 */
export function effectDimension(
  catalogue: CatalogueGroup[],
  searched: CatalogueGroup[],
  effect: EffectFilter,
): CatalogFilterDimension | undefined {
  const whole = effectCounts(catalogue);
  if (effect === 'all' && (whole.reads === 0 || whole.changes === 0)) {
    return undefined;
  }
  const counts = effectCounts(searched);
  return {
    id: EFFECT_FILTER_ID,
    label: 'What it does',
    options: (['reads', 'changes'] as const).map(id => ({
      id,
      label: TOOL_EFFECT_LABELS[id],
      count: counts[id],
    })),
    selected: effect === 'all' ? [] : [effect],
  };
}

/**
 * The effect a dropdown's picks leave: one kind when exactly one is picked;
 * none or both of them is everything.
 */
export function effectFromPicks(values: readonly string[]): EffectFilter {
  const kinds = (['reads', 'changes'] as const).filter(kind =>
    values.includes(kind),
  );
  return kinds.length === 1 ? kinds[0] : 'all';
}

/** How many of a resolved toolset's tools change things. */
export function changingToolCount(tools: readonly ToolSummary[]): number {
  return tools.filter(tool => toolEffect(tool) === 'changes').length;
}

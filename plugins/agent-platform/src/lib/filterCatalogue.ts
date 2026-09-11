import { matchesQuery } from '@giantswarm/backstage-plugin-ui-react';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import { hasEntries, type CatalogueGroup } from './toolset';

function toolMatches(query: string, tool: ToolSummary): boolean {
  return matchesQuery(
    query,
    `${tool.name} ${tool.summary ?? ''} ${tool.description ?? ''}`,
  );
}

/**
 * Narrows the catalogue to what matches a search, keeping the grouping: the
 * group and server a match came from is part of what identifies a tool, and a
 * flat result list would relayout the page on the first keystroke (the same
 * choice the Skills step makes). A server whose *name* matches keeps all its
 * tools; otherwise only the matching tools stay. Empty servers and groups
 * disappear — except a sign-in-gated server whose name matches, which has no
 * tools to show yet and must not vanish under a search for it.
 */
export function filterCatalogue(
  groups: CatalogueGroup[],
  query: string,
): CatalogueGroup[] {
  if (query === '') {
    return groups;
  }
  return groups
    .map(group => {
      const servers = group.servers
        .map(bucket => {
          if (matchesQuery(query, bucket.name)) {
            return bucket;
          }
          return {
            ...bucket,
            tools: bucket.tools.filter(tool => toolMatches(query, tool)),
          };
        })
        .filter(
          bucket =>
            bucket.tools.length > 0 ||
            (bucket.needsSignIn && matchesQuery(query, bucket.name)),
        );
      return {
        ...group,
        servers,
        platformAdministration: group.platformAdministration.filter(tool =>
          toolMatches(query, tool),
        ),
        workflows: group.workflows.filter(tool => toolMatches(query, tool)),
      };
    })
    .filter(hasEntries);
}

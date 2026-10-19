import {
  formatCount,
  formatSeconds,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import type { Fact } from '@giantswarm/backstage-plugin-ui-react';

import type { McpUsage } from '../../apis';

/**
 * A tool's calls, errors and p95 latency from its connector's usage read (the
 * one its Usage tab shows, which lists every tool called): zeros and "—" for
 * a tool nobody called. None where usage cannot be queried.
 */
export function toolUsageFacts(
  usage: McpUsage | undefined,
  tool: string,
): Fact[] | undefined {
  if (!usage?.available) {
    return undefined;
  }
  const row = usage.top_tools.find(entry => entry.tool === tool);
  return [
    { label: 'Calls', value: formatCount(row?.calls ?? 0) },
    { label: 'Errors', value: formatCount(row?.errors ?? 0) },
    { label: 'p95 latency', value: formatSeconds(row?.p95_seconds) },
  ];
}

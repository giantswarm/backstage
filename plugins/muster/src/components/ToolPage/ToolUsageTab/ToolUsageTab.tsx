import { useMemo } from 'react';
import { Link } from '@backstage/ui';
import type { UsageWindowDays } from '@giantswarm/backstage-plugin-agent-platform-common';

import type { ServerPageRow } from '../../../lib/serverGrouping';
import { useConnectorUsage } from '../../ConnectorPage/hooks/useConnectorUsage';
import { UsageFigures } from '../../ConnectorPage/UsageFigures';

export type ToolUsageTabProps = {
  /** The tool's name as muster exposes it, which its calls are counted under. */
  name: string;
  /** The connector that offers it: one MCPServer, or a family's instances. */
  row: ServerPageRow;
  installation: string;
  /** The window, from the `?window=` the tab opened with; 30 days without. */
  days?: UsageWindowDays;
  /** The connector as people call it. */
  connectorName: string;
  /** The connector's Usage tab. */
  connectorUsageHref?: string;
};

/**
 * A connector tool's Usage tab: every caller's calls to this one tool over
 * the last 30 days (or the window it opened with), from muster's dispatch metrics narrowed to the tool —
 * how many, how many failed, how fast it answered, calls per day by outcome
 * and, for a family, on which instance. The connector's Usage tab's figures
 * ({@link UsageFigures}), with a way to it. The tab reads the usage itself,
 * so the request runs only while it is open.
 */
export function ToolUsageTab({
  name,
  row,
  installation,
  days,
  connectorName,
  connectorUsageHref,
}: ToolUsageTabProps) {
  const read = useConnectorUsage(row, installation, {
    enabled: true,
    tool: name,
    days,
  });
  const instances = useMemo(
    () =>
      row.kind === 'family'
        ? row.servers.map(instance => instance.getName())
        : undefined,
    [row],
  );

  return (
    <UsageFigures
      subject="tool"
      installation={installation}
      days={days}
      read={read}
      instances={instances}
      footer={
        connectorUsageHref && (
          <Link
            href={connectorUsageHref}
          >{`All usage of ${connectorName}`}</Link>
        )
      }
    />
  );
}

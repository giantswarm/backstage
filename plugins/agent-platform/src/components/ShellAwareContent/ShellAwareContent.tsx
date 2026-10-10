import type { ReactNode } from 'react';
import { Content } from '@backstage/core-components';

import { useAgentShell } from '../../hooks/useAgentShell';

/**
 * A routed view's content area, for a view that renders in both frames.
 *
 * In classic chrome it is core-components' `Content`, the gutter the Agent
 * Platform page's header and tabs line up with. Inside the agent-platform
 * shell the view renders within a `ShellPage`, which already draws the
 * column and its gutter — a `Content` there would inset the view a second
 * time, so nothing is added.
 */
export function ShellAwareContent({ children }: { children: ReactNode }) {
  const agentShell = useAgentShell();
  if (agentShell) {
    return <>{children}</>;
  }
  return <Content>{children}</Content>;
}

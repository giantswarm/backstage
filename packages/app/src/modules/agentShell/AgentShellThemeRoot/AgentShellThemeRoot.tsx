import { useEffect } from 'react';
import { useAgentShellArea } from '../agentArea';
import '../agent-shell.css';

/**
 * Marks the document root with `data-agent-shell` — the key of every CSS
 * override in agent-shell.css — exactly while the current location renders
 * the agent shell (flag on, agent-area route). The mark follows the location,
 * so classic pages keep classic styling even for flag users.
 */
export function AgentShellThemeRoot() {
  const active = useAgentShellArea();
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    import('../fonts').catch(() => {});
    document.documentElement.dataset.agentShell = '';
    return () => {
      delete document.documentElement.dataset.agentShell;
    };
  }, [active]);
  return null;
}

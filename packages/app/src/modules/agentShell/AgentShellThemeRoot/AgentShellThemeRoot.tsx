import { useLayoutEffect } from 'react';
import { useAgentShellArea } from '../agentArea';
import { setAgentShellMark } from './useAgentShellAttribute';
import '../agent-shell.css';

/**
 * Marks the document root with `data-agent-shell` — the key of every CSS
 * override in agent-shell.css — exactly while the current location renders
 * the agent shell (Agent Platform available, agent-area route). The mark
 * follows the location, so classic pages keep classic styling even where the
 * Agent Platform is on. Set in a layout effect so the theme providers re-theme
 * before the first paint.
 */
export function AgentShellThemeRoot() {
  const active = useAgentShellArea();
  useLayoutEffect(() => {
    if (!active) {
      return undefined;
    }
    import('../fonts').catch(() => {});
    setAgentShellMark(true);
    return () => setAgentShellMark(false);
  }, [active]);
  return null;
}

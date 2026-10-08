import { useEffect } from 'react';
import '../agent-shell.css';

export function AgentShellThemeRoot() {
  useEffect(() => {
    import('../fonts').catch(() => {});
    document.documentElement.dataset.agentShell = '';
    return () => {
      delete document.documentElement.dataset.agentShell;
    };
  }, []);
  return null;
}

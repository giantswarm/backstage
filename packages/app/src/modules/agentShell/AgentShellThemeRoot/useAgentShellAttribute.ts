import { useEffect, useState } from 'react';

/**
 * Whether the document root currently carries `data-agent-shell`, the mark
 * {@link AgentShellThemeRoot} toggles per location. For code that renders
 * outside the router (the MUI theme providers) and so cannot ask the location
 * itself; inside the router use `useAgentShellArea` instead.
 */
export function useAgentShellAttribute(): boolean {
  const [active, setActive] = useState(
    () => document.documentElement.dataset.agentShell !== undefined,
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setActive(document.documentElement.dataset.agentShell !== undefined);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-agent-shell'],
    });
    // The attribute may have changed between the first render and this effect.
    setActive(document.documentElement.dataset.agentShell !== undefined);
    return () => observer.disconnect();
  }, []);
  return active;
}

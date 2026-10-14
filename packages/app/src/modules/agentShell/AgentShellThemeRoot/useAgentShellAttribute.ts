import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function readMark(): boolean {
  return document.documentElement.dataset.agentShell !== undefined;
}

/**
 * Sets or clears the `data-agent-shell` mark on the document root and tells
 * the theme providers synchronously. Called from a layout effect, the
 * re-themed tree commits before the browser paints, so a crossing between
 * classic and shell never shows a frame of the previous theme.
 */
export function setAgentShellMark(on: boolean): void {
  if (on === readMark()) {
    return;
  }
  if (on) {
    document.documentElement.dataset.agentShell = '';
  } else {
    delete document.documentElement.dataset.agentShell;
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Writes that bypass setAgentShellMark still reach the providers, a
  // microtask later.
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-agent-shell'],
  });
  return () => {
    listeners.delete(listener);
    observer.disconnect();
  };
}

/**
 * Whether the document root currently carries `data-agent-shell`, the mark
 * {@link AgentShellThemeRoot} toggles per location. For code that renders
 * outside the router (the MUI theme providers) and so cannot ask the location
 * itself; inside the router use `useAgentShellArea` instead.
 */
export function useAgentShellAttribute(): boolean {
  return useSyncExternalStore(subscribe, readMark, () => false);
}

import useLocalStorageState from 'use-local-storage-state';

/**
 * Same `gs-` prefix as the plugin's other remembered UI state. Not scoped per
 * installation: how wide someone wants their window's content to be is a
 * property of the window, not of the cluster they happen to be looking at.
 */
const STORAGE_KEY = 'gs-agent-platform-session-rail-collapsed';

/**
 * Whether the session switcher rail is collapsed to its icon strip.
 *
 * Remembered, because it is a layout preference rather than a per-visit choice —
 * someone who works in a narrow window and does not want 280px spent on a rail
 * should say so once.
 */
export function useRailCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useLocalStorageState<boolean>(STORAGE_KEY, {
    defaultValue: false,
  });

  return [collapsed, setCollapsed];
}

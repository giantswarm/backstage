/**
 * Class names on the plugin's elements that do not change between builds, for
 * an app stylesheet to restyle them by (the agent-platform shell's palette
 * does). Renaming one silently drops that styling. The sessions list's state
 * dots read `--agent-platform-state-dot-<tone>` for the same purpose.
 */
export const STABLE_CLASS_NAMES = {
  composer: 'agent-platform-composer',
  selectableCard: 'agent-platform-selectable-card',
  recentSessionTitle: 'agent-platform-recent-session-title',
  message: 'agent-platform-message',
  stateFilter: 'agent-platform-state-filter',
} as const;

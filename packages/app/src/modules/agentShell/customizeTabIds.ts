/** The tabs of `/customize/:tab`, in strip order. */
export const CUSTOMIZE_TAB_IDS = [
  'agents',
  'skills',
  'workspaces',
  'connectors',
  'models',
  'workflows',
] as const;

export type CustomizeTabId = (typeof CUSTOMIZE_TAB_IDS)[number];

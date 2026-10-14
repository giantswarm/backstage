/** The tabs of `/customize/:tab`, in strip order. */
export const CUSTOMIZE_TAB_IDS = [
  'agents',
  'skills',
  'connectors',
  'models',
  'workflows',
] as const;

export type CustomizeTabId = (typeof CUSTOMIZE_TAB_IDS)[number];

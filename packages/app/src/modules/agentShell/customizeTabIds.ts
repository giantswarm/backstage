/** The tabs of `/customize/:tab`, in strip order. */
export const CUSTOMIZE_TAB_IDS = [
  'agents',
  'skills',
  'connectors',
  'models',
  'workflows',
] as const;

export type CustomizeTabId = (typeof CUSTOMIZE_TAB_IDS)[number];

/**
 * The Connectors tab's sub-tabs below its own address, as path segments
 * (`/customize/connectors/<segment>`); the default sub-tab is the tab's own
 * address. muster's `CONNECTOR_GROUPS` draws them; the telemetry test keeps
 * the two in step.
 */
export const CUSTOMIZE_CONNECTOR_SUBTABS = ['families', 'internal'] as const;

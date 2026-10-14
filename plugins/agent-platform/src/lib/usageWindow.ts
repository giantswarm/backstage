/**
 * The Usage screen's time window, shared with the muster plugin's Connectors
 * view through the common package; see its `usageWindow.ts`.
 */
export {
  DEFAULT_USAGE_WINDOW_DAYS,
  formatUsageWindowParam,
  parseUsageWindowParam,
  USAGE_WINDOW_OPTIONS,
  USAGE_WINDOW_PARAM,
  usageDataStart,
  usageWindowLabel,
  type UsageDataStart,
  type UsageWindowDays,
} from '@giantswarm/backstage-plugin-agent-platform-common';

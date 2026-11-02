/**
 * A connector page's tabs below its own address, by path segment, in strip
 * order; Tools, the index, is the bare address. The page offers a tab only
 * where it has something to show (Resources and Prompts with a count above
 * 0, Usage and Details for anything but muster itself, Used by where another
 * plugin attaches it, Instances for a family). The one list of them, so the
 * app's telemetry names the same set the page routes.
 */
export const CONNECTOR_PAGE_TAB_PATHS = [
  'resources',
  'prompts',
  'usage',
  'used-by',
  'instances',
  'details',
] as const;

export type ConnectorPageTabPath = (typeof CONNECTOR_PAGE_TAB_PATHS)[number];

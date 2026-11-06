/**
 * Sanitize a value for use inside a PromQL label matcher string.
 * Strips characters that could break or escape the matcher: `"`, `}`, `\`, newlines.
 */
export function sanitizePromQLValue(value: string): string {
  return value.replace(/["}\\\n\r]/g, '');
}

/**
 * Selects every series of the named metrics on one cluster in a single query.
 * The names come from the metrics registry, so they need no escaping.
 */
export function clusterMetricsSelector(
  metricNames: readonly string[],
  clusterName: string,
): string {
  return `{__name__=~"${metricNames.join('|')}",cluster_id="${sanitizePromQLValue(
    clusterName,
  )}"}`;
}

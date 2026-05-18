/**
 * Parses a chart reference string into its component parts.
 */
export function parseChartRef(chartRef: string): {
  ref: string;
  registry: string;
  repository: string;
  name: string;
} {
  const parts = chartRef.split('/');

  return {
    ref: chartRef,
    registry: parts[0],
    repository: parts.slice(1).join('/'),
    name: parts[parts.length - 1],
  };
}

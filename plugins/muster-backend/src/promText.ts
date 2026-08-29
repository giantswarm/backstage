/**
 * Parser for the text output of the mcp-prometheus tools
 * (`x_prometheus_execute_query` / `x_prometheus_execute_range_query`).
 *
 * The tools render Prometheus results as human-readable text rather than
 * JSON:
 *
 *   Query executed successfully.
 *   Result Type: vector
 *   Result: {outcome="ok"} => 0.0003 @[1787992278.435]
 *   {outcome="error"} => 0.0005 @[1787992278.435]
 *
 * Matrix results put the points on their own lines under each series header:
 *
 *   Result Type: matrix
 *   Result: {outcome="ok"} =>
 *   4.14 @[1787907600]
 *   0 @[1787911200]
 */

export interface PromLabels {
  [key: string]: string;
}

export interface PromPoint {
  /** Unix seconds. */
  ts: number;
  value: number;
}

export interface PromSeries {
  labels: PromLabels;
  points: PromPoint[];
}

/** `{a="b", c="d"} => rest` — labels block, then whatever follows the arrow. */
const SERIES_HEADER = /^\{(.*)\}\s*=>\s*(.*)$/;
/** `1.23 @[1787907600]` — one sample. Value may be NaN/Inf. */
const SAMPLE =
  /^([+-]?(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|NaN|Inf))\s*@\[(\d+(?:\.\d+)?)\]$/;
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

function parseValue(raw: string): number {
  if (raw === 'Inf' || raw === '+Inf') {
    return Infinity;
  }
  if (raw === '-Inf') {
    return -Infinity;
  }
  return Number(raw);
}

function parseLabels(raw: string): PromLabels {
  const labels: PromLabels = {};
  for (const match of raw.matchAll(LABEL)) {
    labels[match[1]] = match[2].replace(/\\(.)/g, '$1');
  }
  return labels;
}

/**
 * Parse the tool's text output into series. Works for both vector results
 * (one inline sample per series) and matrix results (samples on their own
 * lines under the series header). Lines that are neither a series header nor
 * a sample (the status/type preamble) are skipped, so unknown preamble
 * variations degrade to an empty result rather than an exception.
 */
export function parsePromToolText(text: string): PromSeries[] {
  const series: PromSeries[] = [];
  let current: PromSeries | undefined;

  for (const rawLine of text.split('\n')) {
    // The first series header is prefixed with `Result: `.
    const line = rawLine.replace(/^Result:\s*/, '').trim();
    if (line === '') {
      continue;
    }

    const header = line.match(SERIES_HEADER);
    if (header) {
      current = { labels: parseLabels(header[1]), points: [] };
      series.push(current);
      const inline = header[2].trim();
      if (inline !== '') {
        const sample = inline.match(SAMPLE);
        if (sample) {
          current.points.push({
            ts: Number(sample[2]),
            value: parseValue(sample[1]),
          });
        }
      }
      continue;
    }

    const sample = line.match(SAMPLE);
    if (sample && current) {
      current.points.push({
        ts: Number(sample[2]),
        value: parseValue(sample[1]),
      });
    }
  }

  return series;
}

/** The single value of a vector series, or undefined when absent/non-finite. */
export function finiteValue(s: PromSeries | undefined): number | undefined {
  const value = s?.points[0]?.value;
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

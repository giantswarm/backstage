/**
 * Detects the one result shape worth a richer renderer than the JSON viewer: a
 * list of like-shaped objects (a k8s `List`, or a bare array of resources). The
 * tool explorer renders these as a compact table; everything else stays JSON.
 *
 * ponytail: only the list-of-objects shape is special-cased (the most common
 * `*_list` result). Text/markdown and single-object shapes still render as JSON.
 * Upgrade path: add per-shape renderers as real result types appear.
 */
export interface TableShape {
  columns: string[];
  rows: Record<string, unknown>[];
}

const MAX_COLUMNS = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

/** Pull the array of items out of a k8s-list-shaped result, if present. */
function itemsOf(result: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(result)) {
    return result.every(isPlainObject)
      ? (result as Record<string, unknown>[])
      : null;
  }
  if (isPlainObject(result) && Array.isArray(result.items)) {
    return result.items.every(isPlainObject)
      ? (result.items as Record<string, unknown>[])
      : null;
  }
  return null;
}

/**
 * Flatten the k8s-ish bits of a row (metadata.name/namespace) up to the top
 * level so they become first-class columns, then keep the remaining scalar
 * fields. Non-scalar values are JSON-stringified by the renderer.
 */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const metadata = row.metadata;
  if (isPlainObject(metadata)) {
    if (metadata.name !== undefined) out.name = metadata.name;
    if (metadata.namespace !== undefined) out.namespace = metadata.namespace;
  }
  for (const [key, value] of Object.entries(row)) {
    if (key === 'metadata' && isPlainObject(metadata)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/** Order columns so identifying fields lead, capped at MAX_COLUMNS. */
function orderColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      seen.add(key);
    }
  }
  const priority = ['name', 'namespace', 'kind', 'type', 'status', 'state'];
  const scored = [...seen].sort((a, b) => {
    const pa = priority.indexOf(a);
    const pb = priority.indexOf(b);
    if (pa !== -1 || pb !== -1) {
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    }
    return a.localeCompare(b);
  });
  return scored.slice(0, MAX_COLUMNS);
}

export function detectTable(result: unknown): TableShape | null {
  const items = itemsOf(result);
  if (!items || items.length === 0) {
    return null;
  }
  const rows = items.map(flattenRow);
  const columns = orderColumns(rows);
  // Require at least one mostly-scalar column, else a JSON dump is clearer.
  const hasScalarColumn = columns.some(col =>
    rows.some(row => isScalar(row[col])),
  );
  if (!hasScalarColumn) {
    return null;
  }
  return { columns, rows };
}

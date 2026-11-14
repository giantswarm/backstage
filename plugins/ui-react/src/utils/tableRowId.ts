/**
 * The key of a bui `Table` row whose id comes from data, such as a
 * resource's name. The table keys its columns and rows in one collection, so
 * a row keyed by a value alone breaks the whole table, with a duplicate key,
 * once a value equals a column id (a model named `default`). Keyed by its
 * kind as well, it cannot.
 */
export function tableRowId(kind: string, value: string): string {
  return `${kind}:${value}`;
}

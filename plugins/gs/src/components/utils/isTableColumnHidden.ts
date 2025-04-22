export function isTableColumnHidden(
  column: string | undefined,
  {
    defaultValue,
    visibleColumns,
    queryParameters,
  }: {
    defaultValue?: boolean;
    visibleColumns?: string[];
    queryParameters?: Record<string, string | string[]>;
  } = {
    defaultValue: false,
    visibleColumns: [],
    queryParameters: {},
  },
) {
  if (!column) {
    return false;
  }

  if (queryParameters && queryParameters[column]) {
    return false;
  }

  if (visibleColumns && visibleColumns.length) {
    return !visibleColumns.includes(column);
  }

  return Boolean(defaultValue);
}

import type { SortDescriptor } from '@backstage/ui';
import type { CatalogFacet } from '@giantswarm/backstage-plugin-ui-react';

import { type CustomizeStatus, modelStatus } from '../../lib/customize';
import { providerName } from '../../lib/modelConfigs';
import type { OrganizationDirectory } from '../../lib/organizations';
import { ownerDisplayOf, tenantKindOf } from '../../lib/tenants';
import type { ModelRow } from '../ModelsTable';

/** A row of Customize › Models: the model and what its columns show. */
export type ModelListRow = ModelRow & {
  /** "Platform", the organization's display name, or a bare namespace. */
  owner: string;
  /** The owner is a namespace that is no organization: shown muted. */
  ownerIsNamespace: boolean;
  /** The provider as the add-model form names it. */
  providerName: string;
  status: CustomizeStatus;
  /** How many agents run on it; undefined while the agents are read. */
  usedCount?: number;
  /**
   * The resource name, where another row on the environment carries the same
   * display name and owner: the only thing telling them apart.
   */
  resourceName?: string;
};

/** The row as the list shows it. */
export function toModelListRow(
  row: ModelRow,
  directory: OrganizationDirectory,
  usedCount: number | undefined,
): ModelListRow {
  const ownerIsNamespace =
    tenantKindOf(row.namespace, directory) === 'namespace';
  return {
    ...row,
    owner: ownerIsNamespace
      ? row.namespace
      : ownerDisplayOf(row.namespace, directory),
    ownerIsNamespace,
    providerName: providerName(row.provider),
    status: modelStatus(row),
    ...(usedCount === undefined ? {} : { usedCount }),
  };
}

const sameModelKey = (row: ModelListRow) =>
  `${row.installation}/${row.owner}/${row.displayName}`;

/**
 * The rows, each that shares its environment, owner and display name with
 * another one naming its resource too.
 */
export function withResourceNames(rows: ModelListRow[]): ModelListRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(sameModelKey(row), (counts.get(sameModelKey(row)) ?? 0) + 1);
  }
  return rows.map(row =>
    (counts.get(sameModelKey(row)) ?? 0) > 1
      ? { ...row, resourceName: row.name }
      : row,
  );
}

/** "In use" or "Not used", for the Used by filter. */
export const IN_USE = 'In use';
export const NOT_USED = 'Not used';

/** The Models tab's filters. */
export const MODEL_FACETS: CatalogFacet<ModelListRow>[] = [
  { id: 'owner', label: 'Owner', value: row => row.owner },
  {
    id: 'provider',
    label: 'Provider',
    value: row => row.providerName || undefined,
  },
  { id: 'status', label: 'Status', value: row => row.status.label },
  {
    id: 'usedBy',
    label: 'Used by',
    // No value while the agents are read, so the filter waits for them.
    value: row => {
      if (row.usedCount === undefined) return undefined;
      return row.usedCount > 0 ? IN_USE : NOT_USED;
    },
    order: [IN_USE, NOT_USED],
  },
];

/** The list's order before a header is clicked: by model, ascending. */
export const MODELS_DEFAULT_SORT: SortDescriptor = {
  column: 'name',
  direction: 'ascending',
};

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** By model, then owner, then environment; the resource name settles a tie. */
function compareByModel(a: ModelListRow, b: ModelListRow): number {
  return (
    compareText(a.displayName, b.displayName) ||
    compareText(a.owner, b.owner) ||
    compareText(a.installation, b.installation) ||
    compareText(a.name, b.name)
  );
}

function compareColumn(
  column: string,
  a: ModelListRow,
  b: ModelListRow,
): number {
  switch (column) {
    case 'owner':
      return compareText(a.owner, b.owner);
    case 'provider':
      return compareText(a.providerName, b.providerName);
    case 'installation':
      return compareText(a.installation, b.installation);
    case 'usedBy':
      return (a.usedCount ?? 0) - (b.usedCount ?? 0);
    case 'status':
      return compareText(a.status.label, b.status.label);
    default:
      return compareByModel(a, b);
  }
}

/**
 * The rows in the order a header asks for; rows alike in that column follow
 * the default order, whichever way the column sorts.
 */
export function sortModelRows(
  rows: ModelListRow[],
  sort: SortDescriptor | undefined,
): ModelListRow[] {
  const column = String(sort?.column ?? MODELS_DEFAULT_SORT.column);
  const sign = sort?.direction === 'descending' ? -1 : 1;
  return [...rows].sort(
    (a, b) => sign * compareColumn(column, a, b) || compareByModel(a, b),
  );
}

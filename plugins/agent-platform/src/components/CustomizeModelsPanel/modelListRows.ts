import type { SortDescriptor } from '@backstage/ui';
import type { CatalogFacet } from '@giantswarm/backstage-plugin-ui-react';

import { type CustomizeStatus, modelStatus } from '../../lib/customize';
import { providerName } from '../../lib/modelConfigs';
import type { OrganizationDirectory } from '../../lib/organizations';
import { ownerDisplayOf, tenantKindOf } from '../../lib/tenants';
import type { ModelRow } from '../ModelsTable';

/**
 * How many agents run on a model, or why that is not known: the agents are
 * still read, or its environment's could not be read.
 */
export type ModelUse = number | 'loading' | 'unreadable';

/** A row of Customize › Models: the model and what its columns show. */
export type ModelListRow = ModelRow & {
  /** "Platform", the organization's display name, or a bare namespace. */
  owner: string;
  /** The owner is a namespace that is no organization: shown muted. */
  ownerIsNamespace: boolean;
  /**
   * Another owner in the list reads the same: the namespace is shown with
   * the owner, in its cell and its filter option.
   */
  ownerIsAmbiguous: boolean;
  /** The provider as the add-model form names it. */
  providerName: string;
  status: CustomizeStatus;
  use: ModelUse;
  /** How many agents run on it, where that is known. */
  usedCount?: number;
  /**
   * The resource name, where another model of its namespace carries the
   * same display name: the only thing telling them apart.
   */
  resourceName?: string;
};

/** The row as the list shows it, before the list compares its rows. */
export function toModelListRow(
  row: ModelRow,
  directory: OrganizationDirectory,
  use: ModelUse,
): ModelListRow {
  const ownerIsNamespace =
    tenantKindOf(row.namespace, directory) === 'namespace';
  return {
    ...row,
    owner: ownerIsNamespace
      ? row.namespace
      : ownerDisplayOf(row.namespace, directory),
    ownerIsNamespace,
    ownerIsAmbiguous: false,
    providerName: providerName(row.provider),
    status: modelStatus(row),
    use,
    ...(typeof use === 'number' ? { usedCount: use } : {}),
  };
}

const sameModelKey = (row: ModelListRow) =>
  `${row.installation}/${row.namespace}/${row.displayName.toLowerCase()}`;

/**
 * The rows, told apart where they read alike: an owner whose name another
 * owner (another namespace) shares shows its namespace, and a model whose
 * display name another model of its namespace shares names its resource.
 */
export function distinguishModelRows(rows: ModelListRow[]): ModelListRow[] {
  const namespacesByOwner = new Map<string, Set<string>>();
  const modelsByName = new Map<string, number>();
  for (const row of rows) {
    const owner = row.owner.toLowerCase();
    namespacesByOwner.set(
      owner,
      (namespacesByOwner.get(owner) ?? new Set()).add(row.namespace),
    );
    const name = sameModelKey(row);
    modelsByName.set(name, (modelsByName.get(name) ?? 0) + 1);
  }
  return rows.map(row => {
    const ownerIsAmbiguous =
      (namespacesByOwner.get(row.owner.toLowerCase())?.size ?? 0) > 1;
    const shared = (modelsByName.get(sameModelKey(row)) ?? 0) > 1;
    return ownerIsAmbiguous || shared
      ? {
          ...row,
          ownerIsAmbiguous,
          ...(shared ? { resourceName: row.name } : {}),
        }
      : row;
  });
}

/** The owner in a line of text: with its namespace where another reads alike. */
export function ownerLabel(row: ModelListRow): string {
  return row.ownerIsAmbiguous ? `${row.owner} (${row.namespace})` : row.owner;
}

/** The model id, with the resource name where that tells the row apart. */
export function modelLabel(row: ModelListRow): string {
  return row.resourceName ? `${row.model} (${row.resourceName})` : row.model;
}

/** "In use" or "Not used", for the Used by filter. */
export const IN_USE = 'In use';
export const NOT_USED = 'Not used';

/**
 * The Models tab's filters. Owner is keyed by namespace, so two owners that
 * read alike stay two options, each naming its namespace.
 */
export function modelFacets(
  rows: readonly ModelListRow[],
): CatalogFacet<ModelListRow>[] {
  const ownerLabels = new Map(
    rows.map(row => [row.namespace, ownerLabel(row)]),
  );
  return [
    {
      id: 'owner',
      label: 'Owner',
      value: row => row.namespace,
      optionLabel: namespace => ownerLabels.get(namespace) ?? namespace,
    },
    {
      id: 'provider',
      label: 'Provider',
      value: row => row.providerName || undefined,
    },
    { id: 'status', label: 'Status', value: row => row.status.label },
    {
      id: 'usedBy',
      label: 'Used by',
      // No value where the agents are not read yet or could not be: such a
      // model is neither in use nor unused as far as the list knows.
      value: row => {
        if (row.usedCount === undefined) return undefined;
        return row.usedCount > 0 ? IN_USE : NOT_USED;
      },
      order: [IN_USE, NOT_USED],
    },
  ];
}

/** The list's order before a header is clicked: by model, ascending. */
export const MODELS_DEFAULT_SORT: SortDescriptor = {
  column: 'name',
  direction: 'ascending',
};

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** By owner as it reads; two owners that read alike by their namespace. */
function compareOwners(a: ModelListRow, b: ModelListRow): number {
  return compareText(a.owner, b.owner) || compareText(a.namespace, b.namespace);
}

/** By model, then owner, then environment; the resource name settles a tie. */
function compareByModel(a: ModelListRow, b: ModelListRow): number {
  return (
    compareText(a.displayName, b.displayName) ||
    compareOwners(a, b) ||
    compareText(a.installation, b.installation) ||
    compareText(a.name, b.name)
  );
}

/** A count where known; an unknown one sorts below none. */
const usedRank = (row: ModelListRow) => row.usedCount ?? -1;

function compareColumn(
  column: string,
  a: ModelListRow,
  b: ModelListRow,
): number {
  switch (column) {
    case 'owner':
      return compareOwners(a, b);
    case 'provider':
      return compareText(a.providerName, b.providerName);
    case 'installation':
      return compareText(a.installation, b.installation);
    case 'usedBy':
      return usedRank(a) - usedRank(b);
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

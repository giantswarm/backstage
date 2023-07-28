/**
 * CustomCatalogTable component is a wrapper around the CatalogTable component - https://github.com/backstage/backstage/blob/v1.16.0/plugins/catalog/src/components/CatalogTable/CatalogTable.tsx
 * It's needed to customize catalog table view, e.g. hide some columns/actions.
 */

import { useEntityList } from '@backstage/plugin-catalog-react';
import { CatalogTable, CatalogTableProps, CatalogTableRow } from '@backstage/plugin-catalog';
import React, { useMemo } from 'react';
import { TableColumn } from '@backstage/core-components';

/**
 * Props for root catalog pages.
 *
 * @public
 */
export interface CustomCatalogTableProps extends CatalogTableProps {}

export function CustomCatalogTable(props: CustomCatalogTableProps) {
  const {
    columns,
    actions,
    tableOptions = {},
    emptyContent,
  } = props;
  const { entities, filters } = useEntityList();

  const defaultColumns: TableColumn<CatalogTableRow>[] = useMemo(() => {
    const columnFactories = CatalogTable.columns;
    return [
      columnFactories.createTitleColumn({ hidden: true }),
      columnFactories.createNameColumn({ defaultKind: filters.kind?.value }),
      ...createEntitySpecificColumns(),
      columnFactories.createMetadataDescriptionColumn(),
      columnFactories.createTagsColumn(),
    ];

    function createEntitySpecificColumns(): TableColumn<CatalogTableRow>[] {
      const baseColumns = [
        // columnFactories.createSystemColumn(), // Hide until we have system information in the catalog
        columnFactories.createOwnerColumn(),
        // columnFactories.createSpecTypeColumn(), // Hide until we have more than one component type in the catalog
        columnFactories.createSpecLifecycleColumn(),
      ];
      switch (filters.kind?.value) {
        case 'user':
          return [];
        case 'domain':
        case 'system':
          return [columnFactories.createOwnerColumn()];
        case 'group':
        case 'template':
          return [columnFactories.createSpecTypeColumn()];
        case 'location':
          return [
            columnFactories.createSpecTypeColumn(),
            columnFactories.createSpecTargetsColumn(),
          ];
        default:
          return entities.every(
            entity => entity.metadata.namespace === 'default',
          )
            ? baseColumns
            : [...baseColumns, columnFactories.createNamespaceColumn()];
      }
    }
  }, [filters.kind?.value, entities]);

  return (
    <CatalogTable
      columns={columns || defaultColumns}
      actions={actions}
      tableOptions={tableOptions}
      emptyContent={emptyContent}
    />
  );
}

/**
 * CustomCatalogTable component is a wrapper around the CatalogTable component - https://github.com/backstage/backstage/blob/v1.16.0/plugins/catalog/src/components/CatalogTable/CatalogTable.tsx
 * It's needed to customize catalog table view, e.g. hide some columns/actions.
 */

import {
  useEntityList,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  CatalogTable,
  CatalogTableProps,
  CatalogTableRow,
} from '@backstage/plugin-catalog';
import React, { useMemo } from 'react';
import { TableColumn, TableProps } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import { withStyles } from '@material-ui/core/styles';
import Star from '@material-ui/icons/Star';
import StarBorder from '@material-ui/icons/StarBorder';

const YellowStar = withStyles({
  root: {
    color: '#f3ba37',
  },
})(Star);

export interface CustomCatalogTableProps extends CatalogTableProps {}

export function CustomCatalogTable(props: CustomCatalogTableProps) {
  const { columns, actions, tableOptions = {}, emptyContent } = props;
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const { entities, filters } = useEntityList();

  const defaultColumns: TableColumn<CatalogTableRow>[] = useMemo(() => {
    const columnFactories = CatalogTable.columns;
    return [
      columnFactories.createTitleColumn({ hidden: true }),
      columnFactories.createNameColumn({ defaultKind: filters.kind?.value }),
      ...createEntitySpecificColumns(),
      columnFactories.createMetadataDescriptionColumn(),
    ].map(column => ({
      ...column,
      width: 'auto',
    }));

    function createEntitySpecificColumns(): TableColumn<CatalogTableRow>[] {
      const baseColumns = [
        columnFactories.createOwnerColumn(),
        columnFactories.createSpecTypeColumn(),
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

  const defaultActions: TableProps<CatalogTableRow>['actions'] = [
    ({ entity }) => {
      const isStarred = isStarredEntity(entity);
      const title = isStarred ? 'Remove from favorites' : 'Add to favorites';

      return {
        cellStyle: { paddingLeft: '1em' },
        icon: () => (
          <>
            <Typography variant="srOnly">{title}</Typography>
            {isStarred ? <YellowStar /> : <StarBorder />}
          </>
        ),
        tooltip: title,
        onClick: () => toggleStarredEntity(entity),
      };
    },
  ];

  return (
    <CatalogTable
      columns={columns || defaultColumns}
      actions={actions || defaultActions}
      tableOptions={{
        ...tableOptions,
        actionsCellStyle: {
          padding: '0 18px',
        },
      }}
      emptyContent={emptyContent}
    />
  );
}

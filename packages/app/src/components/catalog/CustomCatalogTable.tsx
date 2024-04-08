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
import {
  GSColumnFactories,
  isEntityGSHelmChartsAvailable,
  isEntityGSLatestReleaseAvailable,
} from '@internal/plugin-gs';

const YellowStar = withStyles({
  root: {
    color: '#f3ba37',
  },
})(Star);

const noWrapStyle = {
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
};

function addCellStyle<T extends TableColumn<any>>(
  column: T,
  style: React.CSSProperties,
): T {
  return {
    ...column,
    cellStyle: {
      ...column.cellStyle,
      ...style,
    },
  };
}

function noWrapColumn<T extends TableColumn<any>>(column: T) {
  return addCellStyle(column, noWrapStyle);
}

function hiddenColumn<T extends TableColumn<any>>(column: T) {
  return {
    ...column,
    hidden: true,
  };
}

export interface CustomCatalogTableProps extends CatalogTableProps {}

export function CustomCatalogTable(props: CustomCatalogTableProps) {
  const { columns, actions, tableOptions = {}, emptyContent } = props;
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const { entities, filters } = useEntityList();

  const defaultColumns: TableColumn<CatalogTableRow>[] = useMemo(() => {
    const columnFactories = CatalogTable.columns;
    return [
      noWrapColumn(
        columnFactories.createNameColumn({ defaultKind: filters.kind?.value }),
      ),
      ...createEntitySpecificColumns(),
      hiddenColumn(GSColumnFactories.createDescriptionColumn()),
    ].map(column => ({
      ...column,
      width: 'auto',
    }));

    function createEntitySpecificColumns(): TableColumn<CatalogTableRow>[] {
      const baseColumns = [
        noWrapColumn(columnFactories.createOwnerColumn()),
        noWrapColumn(columnFactories.createSpecTypeColumn()),
        columnFactories.createSpecLifecycleColumn(),
      ];
      if (entities.some(entity => entity.metadata.namespace !== 'default')) {
        baseColumns.push(columnFactories.createNamespaceColumn());
      }
      if (entities.some(entity => isEntityGSLatestReleaseAvailable(entity))) {
        baseColumns.push(GSColumnFactories.createLatestReleaseColumn());
        baseColumns.push(GSColumnFactories.createLastReleasedColumn());
      }
      if (entities.some(entity => isEntityGSHelmChartsAvailable(entity))) {
        baseColumns.push(GSColumnFactories.createHelmChartsColunm());
        baseColumns.push(
          noWrapColumn(GSColumnFactories.createHelmChartAppVersionColumn()),
        );
      }

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
          return baseColumns;
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
        padding: 'default',
        actionsCellStyle: {
          padding: '0 18px',
        },
        columnsButton: true,
      }}
      emptyContent={emptyContent}
    />
  );
}

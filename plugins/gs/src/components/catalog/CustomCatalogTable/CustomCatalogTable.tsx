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
import { useMemo } from 'react';
import { TableColumn, TableProps } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import { withStyles } from '@material-ui/core/styles';
import Star from '@material-ui/icons/Star';
import StarBorder from '@material-ui/icons/StarBorder';
import { columnFactories, hiddenColumn, noWrapColumn } from '../columns';
import {
  isEntityHelmChartsAvailable,
  isEntityLatestReleaseAvailable,
} from '../../utils/entity';

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
    return [
      noWrapColumn(
        columnFactories.createNameColumnWithIcon({
          defaultKind: filters.kind?.value,
        }),
      ),
      ...createEntitySpecificColumns(),
      hiddenColumn(columnFactories.createDescriptionColumn()),
    ].map(column => ({
      ...column,
      width: 'auto',
    }));

    function createEntitySpecificColumns(): TableColumn<CatalogTableRow>[] {
      const baseColumns = [
        noWrapColumn(CatalogTable.columns.createOwnerColumn()),
        noWrapColumn(CatalogTable.columns.createSpecTypeColumn()),
        CatalogTable.columns.createSpecLifecycleColumn(),
      ];
      if (entities.some(entity => entity.metadata.namespace !== 'default')) {
        baseColumns.push(CatalogTable.columns.createNamespaceColumn());
      }
      if (entities.some(entity => isEntityLatestReleaseAvailable(entity))) {
        baseColumns.push(columnFactories.createLatestReleaseColumn());
        baseColumns.push(columnFactories.createLastReleasedColumn());
      }
      if (entities.some(entity => isEntityHelmChartsAvailable(entity))) {
        baseColumns.push(columnFactories.createHelmChartsColunm());
        baseColumns.push(
          noWrapColumn(columnFactories.createHelmChartAppVersionColumn()),
        );
      }

      switch (filters.kind?.value) {
        case 'user':
          return [];
        case 'domain':
        case 'system':
          return [CatalogTable.columns.createOwnerColumn()];
        case 'group':
        case 'template':
          return [CatalogTable.columns.createSpecTypeColumn()];
        case 'location':
          return [
            CatalogTable.columns.createSpecTypeColumn(),
            CatalogTable.columns.createSpecTargetsColumn(),
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
        actionsCellStyle: {
          padding: '0 18px',
        },
        columnsButton: true,
        thirdSortClick: false,
      }}
      emptyContent={emptyContent}
    />
  );
}

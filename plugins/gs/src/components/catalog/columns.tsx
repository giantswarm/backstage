import React from 'react';
import { TableColumn } from '@backstage/core-components';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { Box, Typography } from '@material-ui/core';
import {
  getHelmChartsAppVersionsFromEntity,
  getHelmChartsFromEntity,
  getLatestReleaseDateFromEntity,
  getLatestReleaseTagFromEntity,
} from '../utils/entity';
import { DateComponent } from '../UI';
import { compareDates } from '../utils/helpers';
import { Entity } from '@backstage/catalog-model';
import { semverCompareSort } from '../utils/tableHelpers';

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

export function noWrapColumn<T extends TableColumn<any>>(column: T) {
  return addCellStyle(column, noWrapStyle);
}

export function hiddenColumn<T extends TableColumn<any>>(column: T) {
  return {
    ...column,
    hidden: true,
  };
}

export function autoWidthColumn<T extends TableColumn<any>>(column: T) {
  return {
    ...column,
    width: 'auto',
  };
}

export const columnFactories = Object.freeze({
  createDescriptionColumn(): TableColumn<CatalogTableRow> {
    return {
      title: 'Description',
      field: 'entity.metadata.description',
      width: 'auto',
      cellStyle: {
        wordBreak: 'normal',
      },
      render: ({ entity }) => (
        <Box width="400px">
          <Typography variant="body2">{entity.metadata.description}</Typography>
        </Box>
      ),
    };
  },
  createLatestReleaseColumn(
    options: {
      hidden: boolean;
    } = { hidden: false },
  ): TableColumn<CatalogTableRow> {
    return {
      title: 'Latest release',
      hidden: options.hidden,
      width: 'auto',
      customSort: semverCompareSort(({ entity }) =>
        getLatestReleaseTagFromEntity(entity),
      ),
      customFilterAndSearch(query: string, { entity }) {
        const entityTag = getLatestReleaseTagFromEntity(entity);

        return entityTag
          ? entityTag
              .toLocaleUpperCase('en-US')
              .includes(query.toLocaleUpperCase('en-US'))
          : false;
      },
      render: ({ entity }) => getLatestReleaseTagFromEntity(entity),
    };
  },
  createLastReleasedColumn(
    options: {
      hidden: boolean;
    } = { hidden: false },
  ): TableColumn<CatalogTableRow> {
    return {
      title: 'Last released',
      hidden: options.hidden,
      width: 'auto',
      filtering: false,
      customSort({ entity: entity1 }, { entity: entity2 }) {
        const entity1Date = getLatestReleaseDateFromEntity(entity1);
        const entity2Date = getLatestReleaseDateFromEntity(entity2);

        if (!entity1Date && !entity2Date) {
          return 0;
        }

        if (!entity1Date) {
          return 1;
        }

        if (!entity2Date) {
          return -1;
        }

        return compareDates(entity2Date, entity1Date);
      },
      render: ({ entity }) => (
        <DateComponent
          value={getLatestReleaseDateFromEntity(entity)}
          relative
        />
      ),
    };
  },
  createHelmChartsColunm(
    options: {
      hidden: boolean;
    } = { hidden: false },
  ): TableColumn<CatalogTableRow> {
    return {
      title: 'Helm charts',
      hidden: options.hidden,
      width: 'auto',
      filtering: false,
      customSort({ entity: entity1 }, { entity: entity2 }) {
        const entity1HelmCharts = getHelmChartsFromEntity(entity1) || [];
        const entity2HelmCharts = getHelmChartsFromEntity(entity2) || [];

        if (entity1HelmCharts.length < entity2HelmCharts.length) {
          return -1;
        }
        if (entity1HelmCharts.length > entity2HelmCharts.length) {
          return 1;
        }

        return 0;
      },
      render: ({ entity }) => {
        const helmCharts = getHelmChartsFromEntity(entity);

        if (!helmCharts) {
          return undefined;
        }

        return helmCharts.length === 1 ? 'Yes' : `Yes (${helmCharts.length})`;
      },
    };
  },
  createHelmChartAppVersionColumn(
    options: {
      hidden: boolean;
    } = { hidden: false },
  ): TableColumn<CatalogTableRow> {
    return {
      title: 'Chart app version',
      hidden: options.hidden,
      width: 'auto',
      filtering: false,
      sorting: false,
      render: ({ entity }) => {
        const helmCharts = getHelmChartsFromEntity(entity);
        const appVersions = getHelmChartsAppVersionsFromEntity(entity);

        if (!helmCharts || !appVersions) {
          return undefined;
        }

        const versionsMap: { [key: string]: string } = {};
        helmCharts.forEach((chart, idx) => {
          const version = appVersions[idx];
          if (version && version !== '') {
            versionsMap[chart] = version;
          }
        });

        if (Object.entries(versionsMap).length === 1) {
          return Object.values(versionsMap)[0];
        }

        return (
          <>
            {Object.entries(versionsMap).map(([chart, version]) => (
              <Typography key={chart} variant="body2">
                {`${chart}: ${version}`}
              </Typography>
            ))}
          </>
        );
      },
    };
  },
  createCustomerColumn(): TableColumn<CatalogTableRow> {
    function formatContent(entity: Entity): string {
      return entity.metadata?.labels?.['giantswarm.io/customer'] ?? '';
    }

    return {
      title: 'Customer',
      width: 'auto',
      filtering: false,
      render: ({ entity }) =>
        entity.metadata?.labels?.['giantswarm.io/customer'] ?? '',
      customFilterAndSearch(query: string, { entity }) {
        return formatContent(entity)
          .toLowerCase()
          .includes(query.toLowerCase());
      },
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return formatContent(entity1).localeCompare(formatContent(entity2));
      },
    };
  },
  createProviderColumn(): TableColumn<CatalogTableRow> {
    function formatContent(entity: Entity): string {
      return entity.metadata?.labels?.['giantswarm.io/provider'] ?? '';
    }

    return {
      title: 'Provider',
      width: 'auto',
      filtering: false,
      render: ({ entity }) => formatContent(entity),
      customFilterAndSearch(query: string, { entity }) {
        return formatContent(entity)
          .toLowerCase()
          .includes(query.toLowerCase());
      },
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return formatContent(entity1).localeCompare(formatContent(entity2));
      },
    };
  },
  createPipelineColumn(): TableColumn<CatalogTableRow> {
    function formatContent(entity: Entity): string {
      return entity.metadata?.labels?.['giantswarm.io/pipeline'] ?? '';
    }

    return {
      title: 'Pipeline',
      width: 'auto',
      filtering: false,
      render: ({ entity }) => formatContent(entity),
      customFilterAndSearch(query: string, { entity }) {
        return formatContent(entity)
          .toLowerCase()
          .includes(query.toLowerCase());
      },
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return formatContent(entity1).localeCompare(formatContent(entity2));
      },
    };
  },
  createRegionColumn(): TableColumn<CatalogTableRow> {
    function formatContent(entity: Entity): string {
      return entity.metadata?.labels?.['giantswarm.io/region'] ?? '';
    }

    return {
      title: 'Region',
      width: 'auto',
      filtering: false,
      render: ({ entity }) => formatContent(entity),
      customFilterAndSearch(query: string, { entity }) {
        return formatContent(entity)
          .toLowerCase()
          .includes(query.toLowerCase());
      },
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return formatContent(entity1).localeCompare(formatContent(entity2));
      },
    };
  },
  createBaseColumn(): TableColumn<CatalogTableRow> {
    function formatContent(entity: Entity): string {
      return entity.metadata?.annotations?.['giantswarm.io/base'] ?? '';
    }

    return {
      title: 'Base domain',
      width: 'auto',
      filtering: false,
      render: ({ entity }) => formatContent(entity),
      customFilterAndSearch(query: string, { entity }) {
        return formatContent(entity)
          .toLowerCase()
          .includes(query.toLowerCase());
      },
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return formatContent(entity1).localeCompare(formatContent(entity2));
      },
    };
  },
  createAccountEngineerColumn(): TableColumn<CatalogTableRow> {
    function formatContent(entity: Entity): string {
      return (
        entity.metadata?.annotations?.['giantswarm.io/account-engineer'] ?? ''
      );
    }

    return {
      title: 'Account engineer',
      width: 'auto',
      filtering: false,
      render: ({ entity }) => formatContent(entity),
      customFilterAndSearch(query: string, { entity }) {
        return formatContent(entity)
          .toLowerCase()
          .includes(query.toLowerCase());
      },
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return formatContent(entity1).localeCompare(formatContent(entity2));
      },
    };
  },
});

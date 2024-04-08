import React from 'react';
import { TableColumn } from '@backstage/core-components';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { Box, Typography } from '@material-ui/core';
import semver from 'semver';
import {
  getHelmChartsAppVersionsFromEntity,
  getHelmChartsFromEntity,
  getLatestReleaseDateFromEntity,
  getLatestReleaseTagFromEntity,
} from '../utils/entity';
import { DateComponent } from '../UI';
import { compareDates } from '../utils/helpers';

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
      customSort({ entity: entity1 }, { entity: entity2 }) {
        const entity1Tag = getLatestReleaseTagFromEntity(entity1);
        const entity2Tag = getLatestReleaseTagFromEntity(entity2);

        if (!entity1Tag && !entity2Tag) {
          return 0;
        }

        if (!entity1Tag) {
          return -1;
        }

        if (!entity2Tag) {
          return 1;
        }

        return semver.compare(entity1Tag, entity2Tag);
      },
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
      customSort({ entity: entity1 }, { entity: entity2 }) {
        const entity1Date = getLatestReleaseDateFromEntity(entity1);
        const entity2Date = getLatestReleaseDateFromEntity(entity2);

        return entity1Date && entity2Date
          ? compareDates(entity2Date, entity1Date)
          : 0;
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
});

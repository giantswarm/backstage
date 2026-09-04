import { TableColumn } from '@backstage/core-components';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { Box, Typography } from '@material-ui/core';
import {
  getBuildFailingChecksFromEntity,
  getBuildStatusFromEntity,
  getBuildToolchainFromEntity,
  getHelmChartsAppVersionsFromEntity,
  getHelmChartsFromEntity,
  getLatestReleaseDateFromEntity,
  getLatestReleaseTagFromEntity,
  getReadinessFlagsFromEntity,
  getReadinessFromEntity,
} from '../utils/entity';
import {
  BUILD_STATUS_MEANINGS,
  buildStatusIntent,
  buildStatusLabel,
  buildStatusRank,
  toolchainOrbText,
  toolchainTitle,
} from '../utils/build';
import {
  READINESS_MEANINGS,
  partitionReadinessFlags,
  readinessIntent,
  readinessLabel,
  readinessRank,
} from '../utils/readiness';
import { DateComponent } from '../UI';
import { compareDates } from '../utils/helpers';
import { Entity } from '@backstage/catalog-model';
import {
  semverCompareSort,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';

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

/**
 * Hover detail for the release-readiness cell: the release blockers, and
 * nothing else.
 *
 * `giantswarm.io/readiness-flags` also carries the importer's chart-metadata
 * gaps, and `giantswarm.io/readiness-advisory` carries gaps that four charts in
 * five have. Putting either in this tooltip would hang a long list of things
 * that are not about releasing off a column titled "Release readiness", and
 * would lead a green "Releasable" row with an unprefixed NO-VALUES-SCHEMA that
 * reads as a blocker. That detail belongs to the card, which has a section per
 * verdict and an explanation per flag.
 *
 * With no release blockers to name — every `releasable` cell, and every
 * `unknown` one, since `verdict()` returns no flags on any unknown path — the
 * hover falls back to what the verdict means. `unknown` is the verdict a reader
 * can least interpret unaided, so leaving it as a bare chip would be the worst
 * place to say nothing.
 */
function readinessTitle(
  readiness: string,
  releaseFlags: string[],
): string | undefined {
  return releaseFlags.length > 0
    ? releaseFlags.join(', ')
    : READINESS_MEANINGS[readiness];
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
  createReadinessColumn(
    options: {
      hidden: boolean;
    } = { hidden: false },
  ): TableColumn<CatalogTableRow> {
    return {
      title: 'Release readiness',
      hidden: options.hidden,
      width: 'auto',
      // Filtering belongs to the sidebar picker, which queries the label
      // server-side rather than matching rendered text.
      filtering: false,
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return (
          readinessRank(getReadinessFromEntity(entity1)) -
          readinessRank(getReadinessFromEntity(entity2))
        );
      },
      render: ({ entity }) => {
        const readiness = getReadinessFromEntity(entity);
        if (!readiness) {
          return undefined;
        }

        const { release: releaseFlags } = partitionReadinessFlags(
          getReadinessFlagsFromEntity(entity),
        );

        return (
          <StatusLabel
            label={readinessLabel(readiness)}
            intent={readinessIntent(readiness)}
            title={readinessTitle(readiness, releaseFlags)}
          />
        );
      },
    };
  },
  /**
   * The verdict `BuildStatusProcessor` writes, with the confirmed failing
   * checks as hover detail. Filtering belongs to the sidebar picker.
   */
  createBuildStatusColumn(
    options: {
      hidden: boolean;
    } = { hidden: false },
  ): TableColumn<CatalogTableRow> {
    return {
      title: 'Build',
      hidden: options.hidden,
      width: 'auto',
      filtering: false,
      customSort({ entity: entity1 }, { entity: entity2 }) {
        return (
          buildStatusRank(getBuildStatusFromEntity(entity1)) -
          buildStatusRank(getBuildStatusFromEntity(entity2))
        );
      },
      render: ({ entity }) => {
        const status = getBuildStatusFromEntity(entity);
        if (!status) {
          return undefined;
        }
        const failing = getBuildFailingChecksFromEntity(entity);

        return (
          <StatusLabel
            label={buildStatusLabel(status)}
            intent={buildStatusIntent(status)}
            title={
              failing.length > 0
                ? failing.join(', ')
                : BUILD_STATUS_MEANINGS[status]
            }
          />
        );
      },
    };
  },
  /**
   * The architect orb the default branch declares, with the app-build-suite
   * and app-test-suite versions it pins as hover detail. Sorts newest orb
   * first; a pin that is not a release (`dev:…`, `volatile`) sorts after every
   * release, since `semverCompareSort` puts anything it cannot parse last.
   */
  createBuildToolchainColumn(
    options: {
      hidden: boolean;
    } = { hidden: false },
  ): TableColumn<CatalogTableRow> {
    return {
      title: 'Build toolchain',
      hidden: options.hidden,
      width: 'auto',
      filtering: false,
      customSort: semverCompareSort(
        ({ entity }) => getBuildToolchainFromEntity(entity).orbVersion,
      ),
      render: ({ entity }) => {
        const toolchain = getBuildToolchainFromEntity(entity);
        const text = toolchainOrbText(toolchain);
        if (!text) {
          return undefined;
        }

        return (
          <Typography
            variant="body2"
            component="span"
            title={toolchainTitle(toolchain)}
          >
            {text}
          </Typography>
        );
      },
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
        const entity1HelmCharts = getHelmChartsFromEntity(entity1);
        const entity2HelmCharts = getHelmChartsFromEntity(entity2);

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

        if (helmCharts.length === 0) {
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
            versionsMap[chart.name] = version;
          }
        });

        if (Object.entries(versionsMap).length === 1) {
          return Object.values(versionsMap)[0];
        }

        return (
          <>
            {Object.entries(versionsMap).map(([chartName, version]) => (
              <Typography key={chartName} variant="body2">
                {`${chartName}: ${version}`}
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

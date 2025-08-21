import { Link as RouterLink } from 'react-router-dom';
import { Link, TableColumn } from '@backstage/core-components';
import { Typography, Box } from '@material-ui/core';
import LocalOfferIcon from '@material-ui/icons/LocalOffer';
import { isTableColumnHidden } from '@giantswarm/backstage-plugin-ui-react';
import { FluxResourceData } from '../FluxResourcesDataProvider';
import { ColorVariant } from '../UI/colors/makeColorVariants';
import { Status } from '../UI/Status';
import { Chip, IconText } from '../UI';
import {
  HelmRelease,
  Kustomization,
  FluxResourceStatus,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { getResourceColorVariant } from '../../utils/getResourceColorVariant';
import {
  AggregatedStatus,
  getAggregatedStatus,
} from '../../utils/getAggregatedStatus';

export const FluxResourceColumns = {
  name: 'name',
  kind: 'kind',
  targetCluster: 'targetCluster',
  namespace: 'namespace',
  status: 'status',
  statusDetails: 'statusDetails',
} as const;

function formatStatus(status: FluxResourceStatus) {
  const aggregatedStatus = getAggregatedStatus(status);

  const statusLabels: Record<AggregatedStatus, string> = {
    ready: 'Ready',
    'not-ready': 'Not Ready',
    inactive: 'Inactive',
    unknown: 'Unknown',
  };

  const statusVariants: Record<AggregatedStatus, ColorVariant> = {
    ready: 'green',
    'not-ready': 'red',
    inactive: 'gray',
    unknown: 'gray',
  };

  return {
    label: statusLabels[aggregatedStatus],
    variant: statusVariants[aggregatedStatus],
  };
}

function formatStatusDetails(status: FluxResourceStatus): {
  text: string;
  status: 'aborted' | 'ok' | 'error';
} {
  let elText = 'Unknown';
  let elStatus: 'aborted' | 'ok' | 'error' = 'aborted';

  if (status.readyStatus === 'True') {
    elText = 'Ready';
    elStatus = 'ok';
  } else if (status.readyStatus === 'False' && !status.isDependencyNotReady) {
    elText = 'Not ready';
    elStatus = 'error';
  } else if (status.readyStatus === 'False' && status.isDependencyNotReady) {
    elText = 'Not ready (dep)';
    elStatus = 'error';
  }

  if (status.isReconciling) {
    elText += ', reconciling';
  }

  if (status.isSuspended) {
    elText = 'Suspended';
    elStatus = 'aborted';
  }

  return { text: elText, status: elStatus };
}

export const getInitialColumns = ({
  visibleColumns,
}: {
  visibleColumns: string[];
}): TableColumn<FluxResourceData>[] => {
  const columns: TableColumn<FluxResourceData>[] = [
    {
      title: 'Name',
      field: FluxResourceColumns.name,
      highlight: true,
      render: row => {
        const el = (
          <Typography variant="inherit" noWrap>
            {row.name}
          </Typography>
        );

        if (row.kind === Kustomization.kind || row.kind === HelmRelease.kind) {
          const basePath = '/flux-resources';
          const params = new URLSearchParams({
            cluster: row.cluster,
            kind: row.kind.toLowerCase(),
            name: row.name,
          });
          if (row.namespace) {
            params.set('namespace', row.namespace);
          }

          const detailsPath = `${basePath}?${params.toString()}`;

          return (
            <Link component={RouterLink} to={detailsPath}>
              {el}
            </Link>
          );
        }

        return el;
      },
    },
    {
      title: 'Kind',
      field: FluxResourceColumns.kind,
      render: row => {
        const colorVariant = getResourceColorVariant(row.kind);
        return <Chip label={row.kind} variant={colorVariant} />;
      },
    },
    {
      title: 'Target Cluster',
      field: FluxResourceColumns.targetCluster,
    },
    {
      title: 'Namespace',
      field: FluxResourceColumns.namespace,
      render: row => <IconText icon={LocalOfferIcon}>{row.namespace}</IconText>,
    },
    {
      title: 'Status',
      field: FluxResourceColumns.status,
      render: row => {
        if (!row.status) {
          return null;
        }

        const { label, variant } = formatStatus(row.status);

        return <Chip label={label} variant={variant} />;
      },
    },
    {
      title: 'Status Details',
      field: FluxResourceColumns.statusDetails,
      render: row => {
        if (!row.status) {
          return null;
        }

        const { text, status } = formatStatusDetails(row.status);

        return (
          <Box style={{ whiteSpace: 'nowrap' }}>
            <Status text={text} status={status} />
          </Box>
        );
      },
    },
  ];

  return columns.map(column => ({
    ...column,
    hidden: isTableColumnHidden(column.field, {
      defaultValue: Boolean(column.hidden),
      visibleColumns,
    }),
  }));
};

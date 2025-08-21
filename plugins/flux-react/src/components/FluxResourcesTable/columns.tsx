import { Link as RouterLink } from 'react-router-dom';
import { Link, TableColumn } from '@backstage/core-components';
import { Typography, Box } from '@material-ui/core';
import LocalOfferIcon from '@material-ui/icons/LocalOffer';
import { isTableColumnHidden } from '@giantswarm/backstage-plugin-ui-react';
import { WorkloadClusterIcon } from '../../assets/icons';
import { FluxResourceData } from '../FluxResourcesDataProvider';
import { ColorVariant } from '../UI/colors/makeColorVariants';
import { Status } from '../UI/Status';
import { Chip, IconText } from '../UI';
import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { getResourceColorVariant } from '../../utils/getResourceColorVariant';

export const FluxResourceColumns = {
  name: 'name',
  kind: 'kind',
  targetCluster: 'targetCluster',
  namespace: 'namespace',
  status: 'status',
  statusDetails: 'statusDetails',
} as const;

function formatStatusDetails(item: FluxResourceData): {
  text: string;
  status: 'aborted' | 'ok' | 'error';
} {
  const readyCondition = item.conditions?.find(c => c.type === 'Ready');
  const readyStatus = readyCondition?.status || 'Unknown';
  const isDependencyNotReady = readyCondition?.reason === 'DependencyNotReady';
  const isReconciling = item.status === 'Reconciling';
  const isSuspended = item.suspended;

  let elText = 'Unknown';
  let elStatus: 'aborted' | 'ok' | 'error' = 'aborted';

  if (readyStatus === 'True') {
    elText = 'Ready';
    elStatus = 'ok';
  } else if (readyStatus === 'False' && !isDependencyNotReady) {
    elText = 'Not ready';
    elStatus = 'error';
  } else if (readyStatus === 'False' && isDependencyNotReady) {
    elText = 'Not ready (dep)';
    elStatus = 'error';
  }

  if (isReconciling) {
    elText += ', reconciling';
  }

  if (isSuspended) {
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
        let aggregatedStatus: string;
        if (row.suspended || row.dependencyNotReady) {
          aggregatedStatus = 'inactive';
        } else if (row.ready) {
          aggregatedStatus = 'ready';
        } else {
          aggregatedStatus = 'not-ready';
        }

        const statusLabels = {
          ready: 'Ready',
          'not-ready': 'Not Ready',
          inactive: 'Inactive',
        };

        const statusVariants = {
          ready: 'green' as ColorVariant,
          'not-ready': 'red' as ColorVariant,
          inactive: 'orange' as ColorVariant,
        };

        return (
          <Chip
            label={statusLabels[aggregatedStatus as keyof typeof statusLabels]}
            variant={
              statusVariants[aggregatedStatus as keyof typeof statusVariants]
            }
          />
        );
      },
    },
    {
      title: 'Status Details',
      field: FluxResourceColumns.statusDetails,
      render: row => {
        const { text, status } = formatStatusDetails(row);
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

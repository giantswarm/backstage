import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Cell, CellText, ColumnConfig, Link, Table } from '@backstage/ui';
import { Typography, makeStyles } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { findTargetClusterName } from '../../../utils/findTargetCluster';
import { getWorkloadNamespace } from '../../../utils/getWorkloadIdentifiers';
import { useMimirHttpRouteHostnames } from '../../../../hooks/useMimirHttpRouteHostnames';
import { HttpRouteHostname } from '../../../../hooks/useMimirHttpRouteHostnames';
import { CertificateCell } from './CertificateCell';

type HostnameRow = HttpRouteHostname & { id: string };

const useStyles = makeStyles(theme => ({
  caption: {
    marginBottom: theme.spacing(1),
    maxWidth: 1000,
  },
  footnote: {
    marginTop: theme.spacing(2),
    maxWidth: 1000,
  },
}));

function certGroupVersion(labels: Record<string, string>): string {
  const group = labels.customresource_group;
  const version = labels.customresource_version;
  if (group && version) return `${group}/${version}`;
  return group ?? version ?? '—';
}

const columnConfig: ColumnConfig<HostnameRow>[] = [
  {
    id: 'hostname',
    label: 'Hostname',
    isRowHeader: true,
    cell: row => (
      <Cell>
        <Link
          href={`https://${row.hostname}/`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {row.hostname}
        </Link>
      </Cell>
    ),
  },
  {
    id: 'certificate',
    label: 'Certificate',
    cell: row => <CertificateCell cert={row.cert} />,
  },
  {
    id: 'route',
    label: 'Route',
    cell: row => <CellText title={row.labels.name ?? '—'} />,
  },
  {
    id: 'crGroupVersion',
    label: 'Resource group/version',
    cell: row => <CellText title={certGroupVersion(row.labels)} />,
  },
];

export function DeploymentHttpRoutesCard() {
  const classes = useStyles();
  const { deployment, installationName } = useCurrentDeployment();

  const clusterName = findTargetClusterName(deployment);
  const workloadNamespace = getWorkloadNamespace(deployment);
  const deploymentName = deployment.getName();

  const { hostnames, isLoading, error } = useMimirHttpRouteHostnames({
    installationName,
    clusterName,
    namespace: workloadNamespace,
    refetchInterval: 30_000,
  });

  if (!clusterName) {
    return null;
  }

  const title = 'Hostnames and certificates';

  if (error) {
    return (
      <InfoCard title={title}>
        <Alert severity="warning">Metrics unavailable</Alert>
      </InfoCard>
    );
  }

  const rows: HostnameRow[] = hostnames.map(entry => ({
    ...entry,
    id: entry.hostname,
  }));

  return (
    <InfoCard title={title}>
      <Typography
        variant="body2"
        color="textSecondary"
        component="p"
        className={classes.caption}
      >
        Based on HTTPRoute metrics for namespace{' '}
        <code>{workloadNamespace || '—'}</code>. The table may contain entries
        that are not related to <code>{deploymentName}</code>.
      </Typography>
      <Table<HostnameRow>
        columnConfig={columnConfig}
        data={isLoading ? undefined : rows}
        isPending={isLoading}
        pagination={{ type: 'none' }}
        emptyState={
          <Typography variant="body2" color="textSecondary">
            No HTTPRoute hostnames found in namespace{' '}
            <code>{workloadNamespace || '—'}</code> on cluster{' '}
            <code>{clusterName}</code>.
          </Typography>
        }
      />
      <Typography
        variant="body2"
        color="textSecondary"
        component="p"
        className={classes.footnote}
      >
        Certificates are matched to each hostname by following the Gateway API
        chain: the HTTPRoute's <code>parentRef</code> identifies the Gateway and
        listener it attaches to, the listener's hostname pattern (e.g.{' '}
        <code>*.example.com</code>) is matched against the hostname, and the
        serving certificate is resolved from cert-manager by the listener's
        conventional Certificate name (
        <code>gateway-&lt;gateway&gt;-&lt;listener&gt;</code>).
      </Typography>
    </InfoCard>
  );
}

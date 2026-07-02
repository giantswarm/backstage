import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import {
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Link,
  Table,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { Typography, makeStyles } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import InfoOutlined from '@material-ui/icons/InfoOutlined';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { findTargetClusterName } from '../../../utils/findTargetCluster';
import { getWorkloadNamespace } from '../../../utils/getWorkloadIdentifiers';
import { useMimirHttpRouteHostnames } from '../../../../hooks/useMimirHttpRouteHostnames';
import { HostnameCertInfo } from '../../../../hooks/resolveHostnameCert';
import { HttpRouteHostname } from '../../../../hooks/useMimirHttpRouteHostnames';

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
  certPrimary: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  dot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: theme.spacing(1),
    flexShrink: 0,
  },
  dotSuccess: { backgroundColor: theme.palette.success.main },
  dotWarning: { backgroundColor: theme.palette.warning.main },
  dotError: { backgroundColor: theme.palette.error.main },
  dotUnknown: { backgroundColor: theme.palette.text.disabled },
  infoButton: {
    marginLeft: theme.spacing(0.5),
  },
  tooltip: {
    maxWidth: 600,
  },
  tooltipContent: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: theme.spacing(1),
    rowGap: theme.spacing(0.5),
    fontSize: '0.75rem',
  },
  tooltipLabel: {
    opacity: 0.7,
  },
  tooltipValue: {
    wordBreak: 'break-word',
  },
}));

type CertSeverity = 'success' | 'warning' | 'error' | 'unknown';

const EXPIRY_WARNING_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function formatExpiry(expirationSeconds?: number): string | undefined {
  if (expirationSeconds === undefined) return undefined;
  const days = Math.round((expirationSeconds * 1000 - Date.now()) / MS_PER_DAY);
  if (days < 0) {
    return `expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`;
  }
  if (days === 0) return 'expires today';
  return `expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}

function certSeverity(cert: HostnameCertInfo): CertSeverity {
  const expiresMs =
    cert.expirationSeconds !== undefined
      ? cert.expirationSeconds * 1000
      : undefined;
  const expired = expiresMs !== undefined && expiresMs <= Date.now();

  if (cert.ready === 'False' || expired) return 'error';
  if (
    expiresMs !== undefined &&
    (expiresMs - Date.now()) / MS_PER_DAY < EXPIRY_WARNING_DAYS
  ) {
    return 'warning';
  }
  if (cert.ready === 'True') return 'success';
  return 'unknown';
}

function readyLabel(ready?: string): string {
  if (ready === 'True') return 'Ready';
  if (ready === 'False') return 'Not ready';
  return 'Unknown';
}

function certGroupVersion(labels: Record<string, string>): string {
  const group = labels.customresource_group;
  const version = labels.customresource_version;
  if (group && version) return `${group}/${version}`;
  return group ?? version ?? '—';
}

function CertificateCell({ cert }: { cert?: HostnameCertInfo }) {
  const classes = useStyles();

  if (!cert) {
    return (
      <Cell>
        <Typography variant="body2" color="textSecondary">
          —
        </Typography>
      </Cell>
    );
  }

  const dotClass = {
    success: classes.dotSuccess,
    warning: classes.dotWarning,
    error: classes.dotError,
    unknown: classes.dotUnknown,
  }[certSeverity(cert)];

  const expiry = formatExpiry(cert.expirationSeconds);
  const primary = [readyLabel(cert.ready), expiry].filter(Boolean).join(' · ');
  const issuer = cert.issuerName;

  return (
    <Cell>
      <div className={classes.certPrimary}>
        <span className={`${classes.dot} ${dotClass}`} />
        <Typography variant="body2">{primary}</Typography>
        <TooltipTrigger delay={200}>
          <ButtonIcon
            className={classes.infoButton}
            icon={<InfoOutlined fontSize="inherit" />}
            aria-label="Certificate details"
            variant="tertiary"
            size="small"
          />
          <Tooltip className={classes.tooltip}>
            <div className={classes.tooltipContent}>
              {issuer && (
                <>
                  <span className={classes.tooltipLabel}>Issuer</span>
                  <span className={classes.tooltipValue}>{issuer}</span>
                </>
              )}
              <span className={classes.tooltipLabel}>Certificate</span>
              <span className={classes.tooltipValue}>{cert.certName}</span>
              <span className={classes.tooltipLabel}>Namespace</span>
              <span className={classes.tooltipValue}>{cert.namespace}</span>
              {cert.hostnamePattern && (
                <>
                  <span className={classes.tooltipLabel}>Host pattern</span>
                  <span className={classes.tooltipValue}>
                    {cert.hostnamePattern}
                  </span>
                </>
              )}
            </div>
          </Tooltip>
        </TooltipTrigger>
      </div>
    </Cell>
  );
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

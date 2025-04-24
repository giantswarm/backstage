import { Link, Typography, Tooltip, styled, Box } from '@material-ui/core';
import { GrafanaIcon } from '../../../assets/icons/CustomIcons';
import { useGrafanaDashboardLink } from '../../hooks';

const StyledGrafanaIcon = styled(GrafanaIcon)(({ theme }) => ({
  marginRight: theme.spacing(0.5),
  fontSize: 'inherit',
  verticalAlign: 'top',
}));

type GrafanaDashboardLinkProps = {
  dashboard: string;
  installationName: string;
  clusterName?: string;
  namespace?: string;
  applicationName: string;
  text?: string;
  tooltip?: string;
};

export const GrafanaDashboardLink = ({
  dashboard,
  installationName,
  clusterName,
  namespace,
  applicationName,
  text,
  tooltip,
}: GrafanaDashboardLinkProps) => {
  let disabledTitle = '';
  if (!clusterName) {
    disabledTitle =
      'Grafana dashboard link is not available. Cluster name is missing for this resource.';
  }
  const linkUrl = useGrafanaDashboardLink(
    dashboard,
    installationName,
    clusterName ?? '',
    namespace ?? 'default',
    applicationName,
  );
  if (!linkUrl) {
    disabledTitle = 'Grafana URL is not configured for this installation.';
  }

  const el = (
    <Typography variant="inherit" noWrap>
      <Box display="flex" alignItems="center">
        <StyledGrafanaIcon /> {text ?? 'Dashboard'}
      </Box>
    </Typography>
  );

  if (disabledTitle !== '') {
    return (
      <Tooltip title={disabledTitle}>
        <Typography variant="inherit" color="textSecondary">
          {el}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Link href={linkUrl} target="_blank" rel="noopener noreferrer">
      {tooltip ? <Tooltip title={tooltip}>{el}</Tooltip> : el}
    </Link>
  );
};

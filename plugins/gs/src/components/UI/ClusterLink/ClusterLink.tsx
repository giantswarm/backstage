import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { clusterDetailsRouteRef } from '../../../routes';
import { ClusterTypes } from '../../clusters/utils';
import {
  ClusterTypeManagementIcon,
  ClusterTypeWorkloadIcon,
} from '../../../assets/icons/CustomIcons';
import { Box, makeStyles, Theme, Tooltip } from '@material-ui/core';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    textDecoration: 'inherit',
  },
  icon: {
    marginRight: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    '& svg': {
      verticalAlign: 'middle',
    },
  },
}));

type ClusterLinkProps = {
  installationName: string;
  namespace: string;
  name: string;
  type: 'management' | 'workload';
};

export const ClusterLink = ({
  installationName,
  namespace,
  name,
  type,
}: ClusterLinkProps) => {
  // The clusters page can be disabled, in which case there is no route to link to.
  const clusterDetailsRouteLink = useRouteRef(clusterDetailsRouteRef);
  const classes = useStyles();

  const Icon =
    type === ClusterTypes.Management
      ? ClusterTypeManagementIcon
      : ClusterTypeWorkloadIcon;

  const typeTooltipTitle =
    type === ClusterTypes.Management
      ? 'Management cluster'
      : 'Workload cluster';

  const content = (
    <Box component="span" className={classes.root}>
      <Tooltip title={typeTooltipTitle}>
        <Box component="span" className={classes.icon}>
          <Icon fontSize="inherit" />
        </Box>
      </Tooltip>
      {name}
    </Box>
  );

  if (!clusterDetailsRouteLink) {
    return content;
  }

  return (
    <Link
      component={RouterLink}
      to={clusterDetailsRouteLink({
        installationName,
        namespace,
        name,
      })}
    >
      {content}
    </Link>
  );
};

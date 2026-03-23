import { Table } from '@backstage/core-components';
import { Box, IconButton, makeStyles, Typography } from '@material-ui/core';
import { useMimirNodePoolNodes } from '../../../../hooks';
import { getColumns } from './columns';
import CloseIcon from '@material-ui/icons/Close';

const useStyles = makeStyles(theme => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2),
  },
}));

interface NodePoolNodesProps {
  installationName: string;
  clusterName: string;
  nodePoolName: string;
  onClose: () => void;
}

const columns = getColumns();

export const NodePoolNodes = ({
  installationName,
  clusterName,
  nodePoolName,
  onClose,
}: NodePoolNodesProps) => {
  const classes = useStyles();

  const { nodes, isLoading, error } = useMimirNodePoolNodes({
    installationName,
    clusterName,
    nodePoolName,
  });

  if (error) {
    return (
      <Typography color="error" variant="body2">
        Failed to load node metrics: {error.message}
      </Typography>
    );
  }

  if (!isLoading && nodes.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        We can't display any details for this node pool, as there are no metrics
        available.
      </Typography>
    );
  }

  return (
    <Table
      isLoading={isLoading}
      data={nodes}
      columns={columns}
      options={{
        paging: false,
        padding: 'dense',
      }}
      components={{
        Toolbar: () => (
          <Box className={classes.toolbar}>
            <Typography variant="h6">
              {nodePoolName} nodes ({nodes.length})
            </Typography>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        ),
      }}
      style={{ width: '100%' }}
    />
  );
};

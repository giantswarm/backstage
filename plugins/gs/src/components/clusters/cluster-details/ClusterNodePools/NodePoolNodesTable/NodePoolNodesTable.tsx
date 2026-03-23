import { Table } from '@backstage/core-components';
import { Box, IconButton, makeStyles, Typography } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import { NodePoolNode } from '../../../../hooks';
import { getColumns } from './columns';

const useStyles = makeStyles(theme => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2),
  },
}));

interface NodePoolNodesTableProps {
  nodePoolName: string;
  nodes: NodePoolNode[];
  isLoading: boolean;
  provider: 'aws' | 'azure';
  onClose: () => void;
}

export const NodePoolNodesTable = ({
  nodePoolName,
  nodes,
  isLoading,
  provider,
  onClose,
}: NodePoolNodesTableProps) => {
  const columns = getColumns(provider);
  const classes = useStyles();

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

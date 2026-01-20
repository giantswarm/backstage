import { useState } from 'react';
import {
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import CloudIcon from '@material-ui/icons/Cloud';
import CloudOffIcon from '@material-ui/icons/CloudOff';
import { McpServer } from '../../api';

const useStyles = makeStyles(theme => ({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  chip: {
    margin: theme.spacing(0.5),
  },
  connectedChip: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
    '& .MuiChip-deleteIcon': {
      color: theme.palette.success.contrastText,
    },
  },
  connectButton: {
    marginLeft: theme.spacing(1),
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
}));

interface McpConnection {
  server: McpServer;
  accessToken: string;
}

interface McpServerSelectorProps {
  servers: McpServer[];
  connections: McpConnection[];
  onConnect: (server: McpServer) => Promise<void>;
  onDisconnect: (serverName: string) => Promise<void>;
  isConnecting: boolean;
}

export const McpServerSelector = ({
  servers,
  connections,
  onConnect,
  onDisconnect,
  isConnecting,
}: McpServerSelectorProps) => {
  const classes = useStyles();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const connectedServerNames = new Set(connections.map(c => c.server.name));
  const availableServers = servers.filter(
    s => !connectedServerNames.has(s.name),
  );

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleConnect = async (server: McpServer) => {
    handleCloseMenu();
    await onConnect(server);
  };

  const handleDisconnect = async (serverName: string) => {
    await onDisconnect(serverName);
  };

  // Don't render anything if no MCP servers are configured
  if (servers.length === 0) {
    return null;
  }

  return (
    <div className={classes.container}>
      {/* Show connected servers as chips */}
      {connections.map(conn => (
        <Tooltip
          key={conn.server.name}
          title={`Connected to ${conn.server.displayName}. Click to disconnect.`}
        >
          <Chip
            icon={<CloudIcon />}
            label={conn.server.displayName}
            onDelete={() => handleDisconnect(conn.server.name)}
            className={`${classes.chip} ${classes.connectedChip}`}
            size="small"
          />
        </Tooltip>
      ))}

      {/* Show connect button if there are available servers */}
      {availableServers.length > 0 && (
        <>
          <Tooltip title="Connect to MCP server">
            <span>
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  isConnecting ? <CircularProgress size={16} /> : <AddIcon />
                }
                onClick={handleOpenMenu}
                disabled={isConnecting}
                className={classes.connectButton}
              >
                {connections.length === 0 ? 'Connect Server' : 'Add Server'}
              </Button>
            </span>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleCloseMenu}
          >
            {availableServers.map(server => (
              <MenuItem
                key={server.name}
                onClick={() => handleConnect(server)}
                className={classes.menuItem}
              >
                <CloudOffIcon fontSize="small" />
                {server.displayName}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      {/* Show message if all servers are connected */}
      {availableServers.length === 0 && connections.length > 0 && (
        <Tooltip title="All MCP servers are connected">
          <IconButton size="small" disabled>
            <CloudIcon />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};

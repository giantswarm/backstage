import { useEffect, useState, MouseEvent } from 'react';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import {
  FluxObject,
  KubeObject,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { TerminalIcon } from '../../../../assets/icons';

const useStyles = makeStyles(theme => ({
  button: {
    padding: theme.spacing(0.5),
  },
  menuItem: {
    minWidth: 200,
  },
}));

function getFullyQualifiedResourceType(resource: KubeObject): string {
  const ctor = resource.constructor as typeof KubeObject;
  return `${ctor.plural}.${ctor.group}`;
}

function buildGetCommand(resource: KubeObject): string {
  const fqrt = getFullyQualifiedResourceType(resource);
  const name = resource.getName();
  const namespace = resource.getNamespace();

  const parts = ['kubectl', 'get', fqrt, name];
  if (namespace) {
    parts.push('-n', namespace);
  }
  parts.push('-o', 'yaml');

  return parts.join(' ');
}

function buildDescribeCommand(resource: KubeObject): string {
  const fqrt = getFullyQualifiedResourceType(resource);
  const name = resource.getName();
  const namespace = resource.getNamespace();

  const parts = ['kubectl', 'describe', fqrt, name];
  if (namespace) {
    parts.push('-n', namespace);
  }

  return parts.join(' ');
}

const fluxReconcileTypeMap: Record<string, string> = {
  Kustomization: 'kustomization',
  HelmRelease: 'helmrelease',
  GitRepository: 'source git',
  OCIRepository: 'source oci',
  HelmRepository: 'source helm',
  ImageRepository: 'image repository',
  ImageUpdateAutomation: 'image update',
};

function buildFluxCommand(
  subcommand: string,
  resource: KubeObject,
): string {
  const fluxType = fluxReconcileTypeMap[resource.getKind()];
  const name = resource.getName();
  const namespace = resource.getNamespace();

  const parts = ['flux', subcommand, fluxType, name];
  if (namespace) {
    parts.push('-n', namespace);
  }

  return parts.join(' ');
}

function isFluxResource(resource: KubeObject): boolean {
  return resource.getKind() in fluxReconcileTypeMap;
}

function isNotSuspended(resource: KubeObject): boolean {
  return (
    isFluxResource(resource) &&
    !(resource instanceof FluxObject && resource.isSuspended())
  );
}

function isSuspended(resource: KubeObject): boolean {
  return (
    isFluxResource(resource) &&
    resource instanceof FluxObject &&
    resource.isSuspended()
  );
}

type CommandDefinition = {
  id: string;
  label: string;
  build: (resource: KubeObject) => string;
  isApplicable?: (resource: KubeObject) => boolean;
};

const commands: CommandDefinition[] = [
  { id: 'get', label: 'kubectl get -o yaml', build: buildGetCommand },
  { id: 'describe', label: 'kubectl describe', build: buildDescribeCommand },
  {
    id: 'flux-reconcile',
    label: 'flux reconcile',
    build: r => buildFluxCommand('reconcile', r),
    isApplicable: isNotSuspended,
  },
  {
    id: 'flux-suspend',
    label: 'flux suspend',
    build: r => buildFluxCommand('suspend', r),
    isApplicable: isNotSuspended,
  },
  {
    id: 'flux-resume',
    label: 'flux resume',
    build: r => buildFluxCommand('resume', r),
    isApplicable: isSuspended,
  },
];

type CopyCommandMenuProps = {
  resource: KubeObject;
};

export const CopyCommandMenu = ({ resource }: CopyCommandMenuProps) => {
  const classes = useStyles();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (copiedId) {
      const timeout = setTimeout(() => setCopiedId(null), 2000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [copiedId]);

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleCopy = async (command: CommandDefinition) => {
    const text = command.build(resource);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(command.id);
    } catch {
      // Clipboard API not available
    }
    handleClose();
  };

  const isOpen = Boolean(anchorEl);

  return (
    <Box>
      <Tooltip title="Copy CLI command">
        <IconButton
          className={classes.button}
          size="small"
          onClick={handleOpen}
          aria-label="Copy CLI command"
          aria-haspopup="true"
        >
          {copiedId ? (
            <CheckIcon fontSize="small" />
          ) : (
            <TerminalIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={isOpen}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        getContentAnchorEl={null}
      >
        {commands
          .filter(command => !command.isApplicable || command.isApplicable(resource))
          .map(command => (
          <MenuItem
            key={command.id}
            className={classes.menuItem}
            onClick={() => handleCopy(command)}
          >
            <Typography variant="body2">{command.label}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

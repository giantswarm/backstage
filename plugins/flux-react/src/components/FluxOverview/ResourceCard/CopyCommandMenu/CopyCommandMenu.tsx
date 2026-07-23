import { useEffect, useState, MouseEvent } from 'react';
import { Box, ButtonIcon, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import CheckIcon from '@material-ui/icons/Check';
import {
  FluxObject,
  KubeObject,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { TerminalIcon } from '../../../../assets/icons';

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

function buildFluxCommand(subcommand: string, resource: KubeObject): string {
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (copiedId) {
      const timeout = setTimeout(() => setCopiedId(null), 2000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [copiedId]);

  const handleCopy = async (command: CommandDefinition) => {
    const text = command.build(resource);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(command.id);
    } catch {
      // Clipboard API not available
    }
  };

  // Stop the click from bubbling up to any wrapping tree/list anchor so opening
  // the menu doesn't also trigger navigation.
  const stopPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const applicableCommands = commands.filter(
    command => !command.isApplicable || command.isApplicable(resource),
  );

  return (
    <Box onClick={stopPropagation}>
      <MenuTrigger>
        <ButtonIcon
          icon={
            copiedId ? (
              <CheckIcon fontSize="small" />
            ) : (
              <TerminalIcon fontSize="small" />
            )
          }
          aria-label="Copy CLI command"
          variant="tertiary"
          size="small"
        />
        <Menu>
          {applicableCommands.map(command => (
            <MenuItem key={command.id} onAction={() => handleCopy(command)}>
              {command.label}
            </MenuItem>
          ))}
        </Menu>
      </MenuTrigger>
    </Box>
  );
};

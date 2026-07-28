import { useEffect, useState, MouseEvent } from 'react';
import {
  Box,
  ButtonIcon,
  Menu,
  MenuItem,
  MenuTrigger,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import CheckIcon from '@material-ui/icons/Check';
import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';
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

type CommandDefinition = {
  id: string;
  label: string;
  build: (resource: KubeObject) => string;
};

// The `flux reconcile`/`suspend`/`resume` commands used to live here. They are
// now offered as buttons in the card footer (see `FluxResourceActions`), which
// act on the resource directly.
const commands: CommandDefinition[] = [
  { id: 'get', label: 'kubectl get -o yaml', build: buildGetCommand },
  { id: 'describe', label: 'kubectl describe', build: buildDescribeCommand },
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

  return (
    <Box onClick={stopPropagation}>
      <MenuTrigger>
        <TooltipTrigger>
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
          <Tooltip>Copy CLI command</Tooltip>
        </TooltipTrigger>
        <Menu>
          {commands.map(command => (
            <MenuItem key={command.id} onAction={() => handleCopy(command)}>
              {command.label}
            </MenuItem>
          ))}
        </Menu>
      </MenuTrigger>
    </Box>
  );
};

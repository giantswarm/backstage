import { MouseEvent, useMemo, useState } from 'react';
import { Box, ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';
import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined';
import {
  KubeObject,
  toManifestYaml,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ManifestDialog } from '@giantswarm/backstage-plugin-ui-react';

type ManifestButtonProps = {
  resource: KubeObject;
};

export const ManifestButton = ({ resource }: ManifestButtonProps) => {
  const [isOpen, setOpen] = useState(false);

  // Serialize only while open: the card re-renders on every poll.
  const current = useMemo(
    () => (isOpen ? toManifestYaml(resource) : null),
    [isOpen, resource],
  );

  // Keep the last manifest after closing, so the dialog doesn't go blank while
  // it fades out.
  const [manifest, setManifest] = useState('');
  if (current !== null && current !== manifest) {
    setManifest(current);
  }

  const namespace = resource.getNamespace();
  const title = `${resource.getKind()} ${namespace ? `${namespace}/` : ''}${resource.getName()}`;

  // Stop the click from bubbling up to any wrapping tree/list anchor so opening
  // the dialog doesn't also trigger navigation.
  const stopPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Box onClick={stopPropagation}>
      <TooltipTrigger>
        <ButtonIcon
          icon={<DescriptionOutlinedIcon fontSize="small" />}
          aria-label="View YAML"
          variant="tertiary"
          size="small"
          onPress={() => setOpen(true)}
        />
        <Tooltip>View YAML</Tooltip>
      </TooltipTrigger>
      <ManifestDialog
        isOpen={isOpen}
        onOpenChange={setOpen}
        title={title}
        manifest={manifest}
        description={
          <>
            The resource as stored on cluster{' '}
            <strong>{resource.cluster}</strong>, without server-side-apply
            bookkeeping. Read-only.
          </>
        }
      />
    </Box>
  );
};

import { MouseEvent } from 'react';
import { Box, ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';
import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined';
import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useShowResourceManifest } from '../../ResourceManifestDialogProvider';

type ManifestButtonProps = {
  resource: KubeObject;
};

export const ManifestButton = ({ resource }: ManifestButtonProps) => {
  const showManifest = useShowResourceManifest();

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
          onPress={() => showManifest(resource)}
        />
        <Tooltip>View YAML</Tooltip>
      </TooltipTrigger>
    </Box>
  );
};

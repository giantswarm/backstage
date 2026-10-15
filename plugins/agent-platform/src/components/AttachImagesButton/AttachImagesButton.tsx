import { ButtonIcon } from '@backstage/ui';
import AddPhotoAlternateOutlinedIcon from '@material-ui/icons/AddPhotoAlternateOutlined';
import { FileTrigger } from 'react-aria-components';
import { MESSAGE_IMAGE_TYPES } from '@giantswarm/backstage-plugin-agent-platform-common';

export type AttachImagesButtonProps = {
  /** Receives the picked files, unchecked: the caller's `addFiles` checks them. */
  onSelect: (files: File[]) => void;
  /**
   * Why the agent cannot take images. The button stays, so the way to attach
   * one can still be found, but a press says why instead of opening a picker.
   */
  unsupportedReason?: string;
  /** Receives {@link unsupportedReason} when the button is pressed. */
  onRefused?: (reason: string) => void;
  isDisabled?: boolean;
};

/**
 * The composer's way to attach images for whoever can neither paste nor drag
 * one: a phone's photo library, a keyboard-only user. Opens the system's file
 * picker for the image types a message takes, several at a time.
 */
export function AttachImagesButton({
  onSelect,
  unsupportedReason,
  onRefused,
  isDisabled = false,
}: AttachImagesButtonProps) {
  const button = (
    <ButtonIcon
      type="button"
      variant="tertiary"
      aria-label="Attach images"
      icon={<AddPhotoAlternateOutlinedIcon />}
      isDisabled={isDisabled}
      onPress={
        unsupportedReason ? () => onRefused?.(unsupportedReason) : undefined
      }
    />
  );
  if (unsupportedReason) {
    return button;
  }
  return (
    <FileTrigger
      acceptedFileTypes={MESSAGE_IMAGE_TYPES}
      allowsMultiple
      onSelect={files => onSelect(Array.from(files ?? []))}
    >
      {button}
    </FileTrigger>
  );
}

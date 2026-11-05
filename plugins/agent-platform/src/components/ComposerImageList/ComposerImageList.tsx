import { useMemo } from 'react';
import {
  ComposerAttachment,
  ComposerAttachmentList,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  formatBytes,
  type MessageImageType,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import type { ComposerImage } from '../../lib/messageImages';

/** What the type the bytes were checked to be is called. */
const TYPE_LABELS: Record<MessageImageType, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
};

export type ComposerImageListProps = {
  images: readonly ComposerImage[];
  onRemove: (id: string) => void;
  /** The last image was removed: put the focus back in the text field. */
  onEmptied: () => void;
};

/** The images attached to the next message, in the composer's box. */
export function ComposerImageList({
  images,
  onRemove,
  onEmptied,
}: ComposerImageListProps) {
  const attachments = useMemo<ComposerAttachment[]>(
    () =>
      images.map(image => ({
        id: image.id,
        name: image.name,
        previewUrl: image.previewUrl,
        description: `${TYPE_LABELS[image.mediaType]} · ${formatBytes(
          image.byteSize,
        )}`,
      })),
    [images],
  );
  return (
    <ComposerAttachmentList
      label="Attached images"
      attachments={attachments}
      onRemove={onRemove}
      onEmptied={onEmptied}
    />
  );
}

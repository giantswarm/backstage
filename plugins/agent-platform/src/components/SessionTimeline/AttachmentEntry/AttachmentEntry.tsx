import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogHeader,
  VisuallyHidden,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import { NoPreviewReason } from '@giantswarm/backstage-plugin-agent-platform-common';
import { formatBytes } from '../../../lib/formatNumbers';
import { TimelineItem } from '../../../lib/kagentTimeline';

const useStyles = makeStyles(theme => ({
  // An attachment sits where its message sits: the sender's side of the column.
  row: {
    display: 'flex',
    '&[data-user="true"]': {
      justifyContent: 'flex-end',
    },
    '&[data-user="true"] $enlarge': {
      alignSelf: 'flex-end',
    },
  },
  attachment: {
    maxWidth: '85%',
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
  },
  // The image is its own "enlarge" control, so it keeps the look of an image
  // and only the cursor and focus ring say it can be pressed. Not stretched to
  // the caption's width, so the press target is the image and nothing beside it.
  enlarge: {
    display: 'block',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    padding: 0,
    border: 0,
    background: 'none',
    cursor: 'zoom-in',
    borderRadius: 'var(--bui-radius-3)',
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
    },
  },
  // Natural size, scrolled rather than scaled: the point of enlarging a tall
  // screenshot is to read it at the size it was taken. The dialog body is the
  // scroll container.
  fullSize: {
    display: 'block',
    maxWidth: 'none',
  },
  // Scaled to fit the column and never taller than a screenful, so a long
  // screenshot cannot push the rest of the conversation out of reach.
  image: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: 480,
    width: 'auto',
    height: 'auto',
    borderRadius: 'var(--bui-radius-3)',
    border: `1px solid ${theme.palette.divider}`,
  },
  caption: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    overflowWrap: 'anywhere',
  },
  // The inert chip for a file with no preview. Deliberately not a link and not a
  // button: there is nothing safe to do with these bytes.
  chip: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.25),
    padding: theme.spacing(1, 1.5),
    borderRadius: 'var(--bui-radius-3)',
    border: `1px dashed ${theme.palette.divider}`,
    backgroundColor: 'var(--bui-bg-neutral-2)',
    fontSize: '0.8125rem',
  },
  name: {
    fontWeight: 500,
    overflowWrap: 'anywhere',
  },
}));

/** Why a file has no preview, in words the reader can act on. */
const NO_PREVIEW_REASONS: Record<NoPreviewReason, string> = {
  'not-previewable':
    'No preview: only PNG, JPEG, GIF and WebP images are shown inline.',
  undecodable: "No preview: the file's contents could not be read.",
  'too-large': 'No preview: the file is too large to show inline.',
  remote:
    'No preview: the file was sent as a link, which the portal does not open.',
  empty: 'No preview: the attachment arrived with no content.',
};

export type AttachmentEntryProps = {
  item: Extract<TimelineItem, { kind: 'attachment' }>;
};

/**
 * A file attached to a message.
 *
 * **The bytes are untrusted and rendered in our own origin**, so an image is only
 * ever shown when the bytes themselves say they are one of the allowlisted raster
 * types, and an SVG is never previewed whatever it calls itself
 * (`readAttachmentPreview`). A previewed image is captioned with the type its
 * bytes carry; the declared type appears only on the chip, as the sender's claim.
 *
 * Anything with no preview renders as an inert chip: the name, the declared type,
 * the size and why there is nothing to see. **No download link** — handing an
 * untrusted file to disk only moves the risk to wherever it is opened next — and
 * the bytes never pass through the markdown renderer, whose sanitiser strips
 * `data:` sources today and should go on doing so.
 */
export function AttachmentEntry({ item }: AttachmentEntryProps) {
  const classes = useStyles();
  const dataUrl =
    item.preview.kind === 'image' ? item.preview.dataUrl : undefined;
  // Held as the URL they apply to, not as flags: the entry is keyed on its
  // position, and an image that takes its place must not inherit this one's
  // load failure or open dialog. A load failure is the browser's verdict on
  // bytes whose header alone looked like an image.
  const [failedUrl, setFailedUrl] = useState<string>();
  const [enlargedUrl, setEnlargedUrl] = useState<string>();
  const isEnlarged = dataUrl !== undefined && enlargedUrl === dataUrl;
  const enlargeRef = useRef<HTMLButtonElement>(null);
  const wasEnlarged = useRef(false);
  // react-aria restores focus to whatever held it when the dialog opened, which
  // is not the image when a pointer press did not focus it (Safari).
  useEffect(() => {
    if (wasEnlarged.current && !isEnlarged) {
      enlargeRef.current?.focus();
    }
    wasEnlarged.current = isEnlarged;
  }, [isEnlarged]);
  const name = item.name ?? 'Attachment';
  const size =
    item.preview.byteSize === undefined
      ? undefined
      : formatBytes(item.preview.byteSize);
  const sender = item.isUser ? (
    <VisuallyHidden>You attached</VisuallyHidden>
  ) : null;

  if (item.preview.kind === 'image' && failedUrl !== dataUrl) {
    const { dataUrl: src, type } = item.preview;
    const facts = [type, size].filter(Boolean);
    return (
      <div
        className={classes.row}
        data-user={item.isUser}
        data-testid="timeline-attachment"
      >
        <figure className={classes.attachment}>
          {sender}
          <button
            ref={enlargeRef}
            type="button"
            className={classes.enlarge}
            aria-label={`Enlarge ${name}`}
            aria-haspopup="dialog"
            onClick={() => setEnlargedUrl(src)}
          >
            <img
              className={classes.image}
              src={src}
              alt={name}
              onError={() => setFailedUrl(src)}
            />
          </button>
          <figcaption className={classes.caption}>
            {/* The name is already the image's accessible name. */}
            <span aria-hidden="true">{name} · </span>
            {facts.join(' · ')}
          </figcaption>
        </figure>
        {/* The same validated `data:` URL, in the page: never a new tab or a
            download, which would hand the bytes to a context we do not control. */}
        <Dialog
          isOpen={isEnlarged}
          onOpenChange={open => setEnlargedUrl(open ? src : undefined)}
          width="min(95vw, 1400px)"
        >
          <DialogHeader>{name}</DialogHeader>
          <DialogBody>
            <img className={classes.fullSize} src={src} alt={name} />
          </DialogBody>
        </Dialog>
      </div>
    );
  }

  const reason =
    item.preview.kind === 'image' ? 'undecodable' : item.preview.reason;
  const facts = [
    item.declaredType === undefined
      ? undefined
      : `declared as ${item.declaredType}`,
    size,
  ].filter(Boolean);
  return (
    <div
      className={classes.row}
      data-user={item.isUser}
      data-testid="timeline-attachment"
    >
      <div className={`${classes.attachment} ${classes.chip}`}>
        {sender}
        <span className={classes.name}>{name}</span>
        {facts.length > 0 && (
          <span className={classes.caption}>{facts.join(' · ')}</span>
        )}
        <span className={classes.caption}>{NO_PREVIEW_REASONS[reason]}</span>
      </div>
    </div>
  );
}

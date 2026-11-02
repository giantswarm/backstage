import { useEffect, useRef } from 'react';
import { ButtonIcon } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';
import { useTouchInput } from '../../utils/breakpoints';

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-2)',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    // Not a press target for the field behind it: a press beside a chip goes
    // to the chip's own controls or nowhere.
    cursor: 'default',
  },
  // A chip: the image, its name and size, and the remove control, in one row.
  // Bounded so a long file name cannot push the row past a phone's width.
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
    maxWidth: '100%',
    minWidth: 0,
    padding: 'var(--bui-space-1)',
    paddingInlineEnd: 0,
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--bui-radius-3)',
    backgroundColor: 'var(--bui-bg-neutral-2)',
  },
  thumbnail: {
    display: 'block',
    flexShrink: 0,
    width: 40,
    height: 40,
    objectFit: 'cover',
    borderRadius: 'var(--bui-radius-2)',
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    maxWidth: 200,
    fontSize: 'var(--bui-font-size-2)',
    lineHeight: 1.3,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  description: {
    color: 'var(--bui-fg-secondary)',
    whiteSpace: 'nowrap',
  },
  // The shell's thumb target on touch input.
  touchTarget: {
    minWidth: 44,
    minHeight: 44,
  },
});

/** One thing a message carries besides its text, as the composer lists it. */
export type ComposerAttachment = {
  /** Unique within the list. */
  id: string;
  /** The file's name: shown, and the remove control's accessible name. */
  name: string;
  /** What the thumbnail shows: a `data:`, `blob:` or same-origin URL. */
  previewUrl: string;
  /** A line under the name, e.g. "PNG · 412 KiB". */
  description?: string;
};

export interface ComposerAttachmentListProps {
  attachments: readonly ComposerAttachment[];
  /** Remove one attachment. */
  onRemove: (id: string) => void;
  /**
   * The last attachment was removed: the caller puts the focus back where the
   * person was writing, since the control that had it is gone.
   */
  onEmptied?: () => void;
  /** The list's accessible name. */
  label?: string;
}

/**
 * What a message carries besides its text, before it is sent: one chip per
 * attachment with a thumbnail, its name and a remove control. Goes in
 * `ComposerFrame`'s `attachments` slot.
 *
 * Removing one moves the focus to the next remove control (the previous one
 * for the last), so a keyboard user can clear several in a row; removing the
 * only one hands the focus to the caller through `onEmptied`.
 */
export function ComposerAttachmentList({
  attachments,
  onRemove,
  onEmptied,
  label = 'Attachments',
}: ComposerAttachmentListProps) {
  const classes = useStyles();
  const touch = useTouchInput();
  const listRef = useRef<HTMLUListElement>(null);
  // The position the focus should land on once a removal has rendered.
  const focusAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    const at = focusAt.current;
    if (at === undefined) {
      return;
    }
    focusAt.current = undefined;
    if (attachments.length === 0) {
      onEmptied?.();
      return;
    }
    const buttons = listRef.current?.querySelectorAll('button');
    buttons?.[Math.min(at, buttons.length - 1)]?.focus();
  }, [attachments, onEmptied]);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <ul ref={listRef} className={classes.list} aria-label={label}>
      {attachments.map((attachment, index) => (
        <li key={attachment.id} className={classes.item}>
          {/* The name beside it says what it is. */}
          <img
            className={classes.thumbnail}
            src={attachment.previewUrl}
            alt=""
          />
          <span className={classes.text}>
            <span className={classes.name} title={attachment.name}>
              {attachment.name}
            </span>
            {attachment.description && (
              <span className={classes.description}>
                {attachment.description}
              </span>
            )}
          </span>
          <ButtonIcon
            type="button"
            variant="tertiary"
            size="small"
            className={touch ? classes.touchTarget : undefined}
            aria-label={`Remove ${attachment.name}`}
            icon={<CloseIcon />}
            onPress={() => {
              focusAt.current = index;
              onRemove(attachment.id);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

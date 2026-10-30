import { Link as RouterLink } from 'react-router-dom';
import { Badge, VisuallyHidden } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';

/**
 * The widest one tag grows. Past it the tag is cut to one line with an
 * ellipsis: a 63-character tag would otherwise push a row's other facts out.
 */
const TAG_MAX_WIDTH = '12rem';

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-2)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    minWidth: 0,
  },
  item: {
    display: 'flex',
    minWidth: 0,
    maxWidth: '100%',
  },
  badge: {
    maxWidth: TAG_MAX_WIDTH,
    minWidth: 0,
  },
  // bui's pressable `Tag`: a deeper tint on hover and its focus ring, on a
  // badge that otherwise reads the same as a plain one.
  link: {
    display: 'flex',
    minWidth: 0,
    maxWidth: '100%',
    color: 'inherit',
    textDecoration: 'none',
    borderRadius: 'var(--bui-radius-2)',
    '&:hover $badge': {
      backgroundColor: 'var(--bui-bg-neutral-3)',
      cursor: 'pointer',
    },
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 1,
    },
  },
  text: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export type TagListProps = {
  tags: readonly string[];
  /** Shows the first `max`, then "+N" for the rest; all when unset. */
  max?: number;
  /**
   * Makes each tag a link to this address (a detail page's tags open the
   * catalog filtered by them). Unset, the tags take no press, so a row they
   * sit in stays one link.
   */
  getHref?: (tag: string) => string | undefined;
  id?: string;
  className?: string;
};

/**
 * A resource's tags, read-only: a list of small badges that look like bui's
 * tags but take no focus and no press, so a row they sit in stays one link;
 * with `getHref`, each is a link instead. A long tag is cut with an ellipsis
 * and read whole on hover. Nothing when there are none.
 */
export function TagList({ tags, max, getHref, id, className }: TagListProps) {
  const classes = useStyles();
  if (tags.length === 0) {
    return null;
  }
  const shown = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - shown.length;
  return (
    <ul
      id={id}
      aria-label="Tags"
      className={[classes.list, className].filter(Boolean).join(' ')}
    >
      {shown.map(tag => {
        const badge = (
          <Badge size="small" title={tag} className={classes.badge}>
            <span className={classes.text}>{tag}</span>
          </Badge>
        );
        const href = getHref?.(tag);
        return (
          <li key={tag} className={classes.item}>
            {href ? (
              <RouterLink to={href} className={classes.link}>
                {badge}
              </RouterLink>
            ) : (
              badge
            )}
          </li>
        );
      })}
      {hidden > 0 && (
        // Not a tag's name, so never a key a tag could take.
        <li key="__more" className={classes.item}>
          <Badge size="small">
            <span aria-hidden>{`+${hidden}`}</span>
            <VisuallyHidden>{`${hidden} more tags`}</VisuallyHidden>
          </Badge>
        </li>
      )}
    </ul>
  );
}

import { Children, Fragment, type ReactNode } from 'react';
import { Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import classNames from 'classnames';

const useStyles = makeStyles({
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    // The containing block of the title link's stretched hit area.
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--bui-space-3)',
    minHeight: 44,
    boxSizing: 'border-box',
    padding: 'var(--bui-space-3) 0',
    borderBottom: '1px solid var(--bui-border-1)',
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  leading: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
  },
  body: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-1)',
  },
  primary: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 'var(--bui-space-2)',
    rowGap: 'var(--bui-space-1)',
    minWidth: 0,
  },
  // Two lines, then an ellipsis: a long snake_case name is read, not cut to
  // "deploy_…" as a table cell cuts it. The full text stays in the link, so
  // assistive tech reads all of it.
  title: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  // The whole row opens the item: the link's hit area stretches over the row,
  // so a thumb landing on the second line still lands on it. Everything else
  // a person can press (actions, details) sits above it.
  stretchedLink: {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
    },
  },
  // Above the stretched link: a status may carry its own InfoHint.
  status: {
    position: 'relative',
    zIndex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    flex: 'none',
    maxWidth: '100%',
  },
  facts: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 'var(--bui-space-1)',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  details: {
    position: 'relative',
    zIndex: 1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  actions: {
    position: 'relative',
    zIndex: 1,
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
    // Level with the first line of the title rather than the row's centre:
    // a row that wraps keeps its actions where the eye finds them.
    marginTop: -4,
  },
});

/** One row of a {@link StackedRowList}. */
export type StackedRowItem = {
  /** Stable key for the row. */
  id: string;
  /**
   * Line 1: what the row is, e.g. the session's title. Wraps to two lines
   * before it is cut, never to a sliver.
   */
  title: ReactNode;
  /**
   * Where the row leads. The title becomes the link, and its hit area covers
   * the whole row; the actions stay separately pressable.
   */
  href?: string;
  /** Before the title, e.g. an avatar or the resource's icon tile. */
  leading?: ReactNode;
  /** After the title on line 1, e.g. a status dot with its label. */
  status?: ReactNode;
  /**
   * Line 2: two to four secondary facts, joined by " · ". Empty entries
   * (`null`, `false`, `''`) are dropped, so a missing fact leaves no
   * dangling separator.
   */
  facts?: ReactNode[];
  /**
   * Under line 2, for what a table hid in `title=` or a tooltip — a reason,
   * a readiness message — and for a row's expanded content. Pressable.
   */
  details?: ReactNode;
  /**
   * At the end of line 1: the row's ⋯ menu or a real button ("Sign in").
   * Always rendered and always reachable — an actions column never
   * disappears at phone width, it moves here. Destructive actions belong in
   * the ⋯ menu.
   */
  actions?: ReactNode;
};

export type StackedRowListProps = {
  rows?: StackedRowItem[];
  /**
   * Rows the list draws as they are, after `rows`: {@link StackedRow}
   * elements, each in a component of its own, for rows that call hooks (a
   * row's status and actions read from one hook call).
   */
  children?: ReactNode;
  /** The list's accessible name, e.g. "Sessions". */
  'aria-label': string;
  /** Shown instead of the list when there are no rows. */
  emptyState?: ReactNode;
  className?: string;
};

function isPresent(fact: ReactNode): boolean {
  return fact !== null && fact !== undefined && fact !== false && fact !== '';
}

/** One stacked row, for a list that renders its own `<ul>`. */
export function StackedRow({
  title,
  href,
  leading,
  status,
  facts,
  details,
  actions,
}: Omit<StackedRowItem, 'id'>) {
  const classes = useStyles();
  const shownFacts = (facts ?? []).filter(isPresent);

  return (
    <li className={classes.row}>
      {leading && <div className={classes.leading}>{leading}</div>}
      <div className={classes.body}>
        <div className={classes.primary}>
          {href ? (
            <Link
              href={href}
              variant="body-medium"
              weight="bold"
              color="primary"
              standalone
              className={classNames(classes.title, classes.stretchedLink)}
            >
              {title}
            </Link>
          ) : (
            <Text variant="body-medium" weight="bold" className={classes.title}>
              {title}
            </Text>
          )}
          {status && <span className={classes.status}>{status}</span>}
        </div>
        {shownFacts.length > 0 && (
          <Text
            as="div"
            variant="body-small"
            color="secondary"
            className={classes.facts}
          >
            {shownFacts.map((fact, index) => (
              <Fragment key={index}>
                {index > 0 && <span aria-hidden="true">·</span>}
                <span>{fact}</span>
              </Fragment>
            ))}
          </Text>
        )}
        {details && <div className={classes.details}>{details}</div>}
      </div>
      {actions && <div className={classes.actions}>{actions}</div>}
    </li>
  );
}

/**
 * A list a person scans to open or act on one item, as stacked rows: the
 * phone layout of a table whose columns would otherwise be squeezed to
 * slivers (bui's `Table` clips, it does not scroll, at 343px).
 *
 * - Line 1: the title (a link to the item when `href` is set, its hit area
 *   the whole row), its status, and the row's actions at the end.
 * - Line 2: the secondary facts, joined by " · ".
 *
 * Swap a table for it with `usePhoneLayout()`; the same rows work on a wide
 * viewport too. For hundreds of rows, render it inside `ShowMore`, which
 * hands it a page at a time. For a name-plus-numbers table, hide columns with
 * `usePhoneColumns` instead.
 */
export function StackedRowList({
  rows = [],
  children,
  'aria-label': ariaLabel,
  emptyState,
  className,
}: StackedRowListProps) {
  const classes = useStyles();
  if (
    rows.length === 0 &&
    Children.count(children) === 0 &&
    emptyState !== undefined
  ) {
    return <>{emptyState}</>;
  }
  return (
    // An explicit role: Safari drops list semantics from a `list-style: none`
    // list, and the count of items is what a screen reader announces first.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul
      role="list"
      aria-label={ariaLabel}
      className={classNames(classes.list, className)}
    >
      {rows.map(({ id, ...row }) => (
        <StackedRow key={id} {...row} />
      ))}
      {children}
    </ul>
  );
}

import type { ReactNode } from 'react';
import { Cell, CellText, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { usePhoneLayout } from '@giantswarm/backstage-plugin-ui-react';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    minWidth: 0,
  },
  // Two lines, then an ellipsis: a model id or `namespace/agent` is read, not
  // cut to "a…" as a single truncated line cuts it in a phone-width column.
  name: {
    minWidth: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  description: {
    minWidth: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  },
});

export type NameCellProps = {
  /** The row's name. */
  title: string;
  /** Where the name links to, if anywhere. */
  href?: string;
  /** The line under the name: an identity fact, or what a hidden column held. */
  description?: string;
  /** Under the name and description, e.g. a Removed badge. */
  children?: ReactNode;
};

/**
 * The name cell of an analytic table (a name plus numbers): bui's `CellText`
 * on a wide viewport; at phone width a cell whose name wraps to two lines and
 * whose description wraps, rather than both cut to one truncated line.
 *
 * With `usePhoneColumns` a table keeps the name and one or two numbers at
 * phone width, so the name column is the wide one — but bui's `CellText`
 * still truncates it, and a model id or a long agent name read as "clau…".
 */
export function NameCell({
  title,
  href,
  description,
  children,
}: NameCellProps) {
  const classes = useStyles();
  const isPhone = usePhoneLayout();

  if (!isPhone && children === undefined) {
    return <CellText title={title} href={href} description={description} />;
  }

  return (
    <Cell>
      <div className={classes.root}>
        {href ? (
          <Link
            href={href}
            variant="body-medium"
            className={isPhone ? classes.name : undefined}
            truncate={isPhone ? undefined : true}
            title={isPhone ? undefined : title}
          >
            {title}
          </Link>
        ) : (
          <Text
            as="p"
            variant="body-medium"
            className={isPhone ? classes.name : undefined}
            truncate={isPhone ? undefined : true}
            title={isPhone ? undefined : title}
          >
            {title}
          </Text>
        )}
        {description && (
          <Text
            variant="body-small"
            color="secondary"
            className={isPhone ? classes.description : undefined}
            truncate={isPhone ? undefined : true}
            title={isPhone ? undefined : description}
          >
            {description}
          </Text>
        )}
        {children}
      </div>
    </Cell>
  );
}

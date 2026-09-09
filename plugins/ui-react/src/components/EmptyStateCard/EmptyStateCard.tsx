import { ReactNode } from 'react';
import { Card, CardBody, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';

// bui exposes no border prop and `Text` no alignment prop, so the outline and
// the centring come from here. The bui neutrals sit close to the page
// background, so without the outline the card dissolves into the page.
const useStyles = makeStyles(theme => ({
  root: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 'var(--bui-radius-3)',
  },
  // Only the copy is centred, never the whole card: `textAlign` inherits, and
  // `children` can be a form whose own labels and messages must stay
  // left-aligned.
  copy: {
    textAlign: 'center',
  },
  description: {
    // Long enough to read as a paragraph, short enough not to run the full
    // width of a wide page column.
    maxWidth: '60ch',
  },
  content: {
    width: '100%',
    maxWidth: 560,
  },
}));

export interface EmptyStateCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** The call to action, centred under the description. */
  actions?: ReactNode;
  /** Richer content than a button — a prompt composer, say. */
  children?: ReactNode;
  className?: string;
}

/**
 * The "there is nothing here yet" card: a full-width bordered panel with
 * centred, larger-than-body copy and a call to action.
 *
 * For the first-run state of a list — where an empty table with column headers
 * says nothing about what the thing is or how to make one.
 */
export function EmptyStateCard({
  title,
  description,
  actions,
  children,
  className,
}: EmptyStateCardProps) {
  const classes = useStyles();

  return (
    <Card className={classNames(classes.root, className)}>
      <CardBody>
        <Flex direction="column" align="center" gap="4" py="6">
          <Flex direction="column" align="center" gap="2">
            <Text
              as="h2"
              variant="title-small"
              weight="bold"
              className={classes.copy}
            >
              {title}
            </Text>
            {description && (
              <Text
                variant="body-large"
                color="secondary"
                className={classNames(classes.copy, classes.description)}
              >
                {description}
              </Text>
            )}
          </Flex>
          {actions}
          {children && <div className={classes.content}>{children}</div>}
        </Flex>
      </CardBody>
    </Card>
  );
}

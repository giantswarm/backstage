import type { ReactNode } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  title: {
    marginBottom: theme.spacing(0.5),
  },
  description: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
}));

export type SectionHeaderProps = {
  title: string;
  /**
   * Prose, or prose with inline markup -- `<strong>` around the one word the
   * sentence is about, say. It is rendered inside the description's own `<p>`,
   * so block elements do not belong here. Without one, the heading stands
   * alone, as a form group named by its key alone does.
   */
  description?: ReactNode;
  /**
   * Heading level. Defaults to `h3`.
   *
   * A page that introduces itself *and* its sections needs two levels, or the
   * first section's heading becomes the page's — which reads as scoping
   * everything below it.
   */
  as?: 'h2' | 'h3' | 'h4';
  /** Type scale. Defaults to `title-small`. */
  variant?: 'title-medium' | 'title-small' | 'title-x-small';
  /**
   * The heading's `id`, for a `<section aria-labelledby>` the header names:
   * the region takes its accessible name from the title alone.
   */
  id?: string;
};

/** Title + description pair used to introduce a page, a card's contents or a group of fields. */
export function SectionHeader({
  title,
  description,
  as = 'h3',
  variant = 'title-small',
  id,
}: SectionHeaderProps) {
  const classes = useStyles();
  return (
    <div>
      <Text
        as={as}
        id={id}
        variant={variant}
        weight="bold"
        className={classes.title}
      >
        {title}
      </Text>
      {description !== undefined && description !== null && (
        <Text as="p" color="secondary" className={classes.description}>
          {description}
        </Text>
      )}
    </div>
  );
}

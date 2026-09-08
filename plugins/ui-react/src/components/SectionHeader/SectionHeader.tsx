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
  description: string;
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
};

/** Title + description pair used to introduce a page or a card's contents. */
export function SectionHeader({
  title,
  description,
  as = 'h3',
  variant = 'title-small',
}: SectionHeaderProps) {
  const classes = useStyles();
  return (
    <div>
      <Text as={as} variant={variant} weight="bold" className={classes.title}>
        {title}
      </Text>
      <Text as="p" color="secondary" className={classes.description}>
        {description}
      </Text>
    </div>
  );
}

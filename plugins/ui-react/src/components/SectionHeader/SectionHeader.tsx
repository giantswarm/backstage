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
};

/** Title + description pair used to introduce a card's contents. */
export function SectionHeader({ title, description }: SectionHeaderProps) {
  const classes = useStyles();
  return (
    <div>
      <Text
        as="h3"
        variant="title-small"
        weight="bold"
        className={classes.title}
      >
        {title}
      </Text>
      <Text as="p" color="secondary" className={classes.description}>
        {description}
      </Text>
    </div>
  );
}

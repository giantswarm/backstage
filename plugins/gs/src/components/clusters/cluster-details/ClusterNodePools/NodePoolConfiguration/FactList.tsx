import { Fragment, type ReactNode } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  list: {
    display: 'grid',
    // Horizontal label | value pairs. Stacking them vertically is what made
    // the previous layout three times taller than its content.
    gridTemplateColumns: 'minmax(120px, 180px) minmax(0, 1fr)',
    columnGap: 'var(--bui-space-6)',
    maxWidth: 720,
    rowGap: 'var(--bui-space-2)',
    alignItems: 'baseline',
    '@media (max-width: 520px)': {
      gridTemplateColumns: '1fr',
      rowGap: 'var(--bui-space-1)',
    },
  },
  value: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
});

export interface Fact {
  label: string;
  value: ReactNode;
}

interface FactListProps {
  facts: Fact[];
}

export const FactList = ({ facts }: FactListProps) => {
  const classes = useStyles();

  return (
    <div className={classes.list}>
      {facts.map(fact => (
        <Fragment key={fact.label}>
          <Text variant="body-small" color="secondary">
            {fact.label}
          </Text>
          <div className={classes.value}>
            {typeof fact.value === 'string' ? (
              <Text variant="body-small">{fact.value}</Text>
            ) : (
              fact.value
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
};

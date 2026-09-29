import { ReactNode } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useContainerDimensions } from '../../hooks';
import classNames from 'classnames';

const useStyles = makeStyles(theme => ({
  // The negative margin offsets the rows' padding, so keys line up with the
  // surrounding content.
  list: {
    margin: theme.spacing(-1),
  },
  item: {
    display: 'flex',
    alignItems: 'baseline',
    flexDirection: 'column',
    padding: theme.spacing(1),
  },
  itemRow: {
    flexDirection: 'row',
  },
  key: {
    margin: 0,
  },
  value: {
    margin: 0,
    wordBreak: 'break-word',
  },
}));

const CONTAINER_LAYOUT_BREAKPOINT = 500;

type StructuredMetadataListProps = {
  metadata: { [key: string]: ReactNode };
  fixedKeyColumnWidth?: string;
};

/**
 * A description list: each key is a term (`dt`) and each value its
 * description (`dd`), so assistive technology reads them as pairs.
 */
export const StructuredMetadataList = ({
  metadata,
  fixedKeyColumnWidth,
}: StructuredMetadataListProps) => {
  const classes = useStyles();
  const [containerRef, dimensions] = useContainerDimensions();

  const rowLayout =
    Boolean(fixedKeyColumnWidth) &&
    dimensions.width >= CONTAINER_LAYOUT_BREAKPOINT;

  return (
    <dl className={classes.list} ref={containerRef}>
      {Object.entries(metadata).map(([key, value]) => (
        <div
          key={key}
          className={classNames(classes.item, {
            [classes.itemRow]: rowLayout,
          })}
        >
          <dt
            className={classes.key}
            style={{ width: rowLayout ? fixedKeyColumnWidth : '100%' }}
          >
            <Text variant="body-medium" weight="bold">
              {key}
            </Text>
          </dt>
          <dd
            className={classes.value}
            style={{
              width: rowLayout ? `calc(100% - ${fixedKeyColumnWidth})` : '100%',
            }}
          >
            {typeof value === 'string' ? (
              <Text variant="body-medium">{value}</Text>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
};

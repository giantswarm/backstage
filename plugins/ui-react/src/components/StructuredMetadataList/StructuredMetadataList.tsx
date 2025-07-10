import { ReactNode } from 'react';
import { Box, Grid, makeStyles, Typography } from '@material-ui/core';
import { useContainerDimensions } from '../../hooks';
import classNames from 'classnames';

const useStyles = makeStyles(() => ({
  item: {
    display: 'flex',
    alignItems: 'baseline',
    flexDirection: 'column',
  },

  itemRow: {
    flexDirection: 'row',
  },
}));

const CONTAINER_LAYOUT_BREAKPOINT = 500;

type StructuredMetadataListProps = {
  metadata: { [key: string]: ReactNode };
  fixedKeyColumnWidth?: string;
};

export const StructuredMetadataList = ({
  metadata,
  fixedKeyColumnWidth,
}: StructuredMetadataListProps) => {
  const classes = useStyles();
  const [containerRef, dimensions] = useContainerDimensions();

  return (
    <Box>
      <Grid container direction="column" ref={containerRef}>
        {Object.entries(metadata).map(([key, value]) => (
          <Grid item key={key}>
            <Box
              className={classNames(classes.item, {
                [classes.itemRow]:
                  dimensions.width >= CONTAINER_LAYOUT_BREAKPOINT,
              })}
            >
              <Box
                minWidth={fixedKeyColumnWidth ? fixedKeyColumnWidth : undefined}
                mr={2}
              >
                <Typography variant="subtitle2">{key}</Typography>
              </Box>
              <Box>
                {typeof value === 'string' ? (
                  <Typography variant="body2">{value}</Typography>
                ) : (
                  value
                )}
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

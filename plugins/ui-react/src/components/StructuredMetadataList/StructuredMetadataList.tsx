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
  value: {
    wordBreak: 'break-word',
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

  const rowLayout =
    Boolean(fixedKeyColumnWidth) &&
    dimensions.width >= CONTAINER_LAYOUT_BREAKPOINT;

  return (
    <Box>
      <Grid container direction="column" ref={containerRef}>
        {Object.entries(metadata).map(([key, value]) => (
          <Grid item xs={12} key={key}>
            <Box
              className={classNames(classes.item, {
                [classes.itemRow]: rowLayout,
              })}
            >
              <Box width={rowLayout ? fixedKeyColumnWidth : '100%'}>
                <Typography variant="subtitle2">{key}</Typography>
              </Box>
              <Box
                width={
                  rowLayout ? `calc(100% - ${fixedKeyColumnWidth})` : '100%'
                }
              >
                {typeof value === 'string' ? (
                  <Typography variant="body2" className={classes.value}>
                    {value}
                  </Typography>
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

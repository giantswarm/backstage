import { useContainerDimensions } from '@giantswarm/backstage-plugin-ui-react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => {
  const bodyBackgroundColor =
    theme.palette.type === 'light' ? '#f8f8f8' : '#333';

  return {
    root: {
      position: 'relative',
      flex: 1,

      '&::before': {
        content: '\"\"',
        position: 'absolute',
        zIndex: 1,
        left: 0,
        top: 0,
        right: theme.spacing(2),
        height: theme.spacing(1),
        background: `linear-gradient(to bottom, ${bodyBackgroundColor}, transparent)`,
      },

      '&::after': {
        content: '\"\"',
        position: 'absolute',
        zIndex: 1,
        left: 0,
        bottom: 0,
        right: theme.spacing(2),
        height: theme.spacing(1),
        background: `linear-gradient(to top, ${bodyBackgroundColor}, transparent)`,
      },
    },
    inner: {
      height: '100%',
    },
  };
});

type ContentContainerProps = {
  renderContent: (containerHeight: number) => React.ReactNode;
};

export const ContentContainer = ({ renderContent }: ContentContainerProps) => {
  const classes = useStyles();
  const [containerRef, dimensions] = useContainerDimensions();

  return (
    <div className={classes.root}>
      <div className={classes.inner} ref={containerRef}>
        {renderContent(dimensions.height)}
      </div>
    </div>
  );
};

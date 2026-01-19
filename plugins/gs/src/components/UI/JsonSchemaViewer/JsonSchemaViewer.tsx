import { Box, makeStyles, useTheme } from '@material-ui/core';
import {
  GLOBAL_CSS_ID,
  GLOBAL_CSS_THEME_ID,
  InvertTheme,
  injectStyles,
} from '@stoplight/mosaic';
// @ts-expect-error Package types exist but can't be resolved due to package.json exports configuration
import { JsonSchemaViewer as StoplightJsonSchemaViewer } from '@stoplight/json-schema-viewer';
import { useEffect } from 'react';

const lightBackgroundColor = '#f8f8f8';
const darkBackgroundColor = '#333333';

const useStyles = makeStyles(theme => ({
  root: {
    '& .sl-stack.sl-sticky': {
      backgroundColor:
        theme.palette.type === 'light'
          ? lightBackgroundColor
          : darkBackgroundColor,
    },
  },
}));

function removeMosaicStyles() {
  const styleIds = [
    GLOBAL_CSS_ID,
    `${GLOBAL_CSS_THEME_ID}-light`,
    `${GLOBAL_CSS_THEME_ID}-dark`,
  ];
  for (const id of styleIds) {
    document.getElementById(id)?.remove();
  }
}

export const JsonSchemaViewer = ({ jsonSchema }: { jsonSchema: any }) => {
  const classes = useStyles();
  const theme = useTheme();

  // Inject styles only when component mounts, clean up on unmount
  useEffect(() => {
    const unsubscribe = injectStyles();
    return () => {
      unsubscribe?.();
      removeMosaicStyles();
    };
  }, []);

  const viewer = (
    <StoplightJsonSchemaViewer
      schema={jsonSchema}
      emptyText="No schema defined"
      defaultExpandedDepth={0}
      expanded
      renderRootTreeLines
    />
  );

  return (
    <Box className={classes.root}>
      {theme.palette.type === 'light' ? (
        viewer
      ) : (
        <InvertTheme>{viewer}</InvertTheme>
      )}
    </Box>
  );
};

import { Box, makeStyles, useTheme } from '@material-ui/core';
import { InvertTheme } from '@stoplight/mosaic';
// @ts-expect-error Package types exist but can't be resolved due to package.json exports configuration
import { JsonSchemaViewer as StoplightJsonSchemaViewer } from '@stoplight/json-schema-viewer';

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

export const JsonSchemaViewer = ({ jsonSchema }: { jsonSchema: any }) => {
  const classes = useStyles();
  const theme = useTheme();

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

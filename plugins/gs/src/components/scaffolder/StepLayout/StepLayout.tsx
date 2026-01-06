import { MarkdownContent } from '@backstage/core-components';
import { LayoutTemplate } from '@backstage/plugin-scaffolder-react';
import CloseIcon from '@material-ui/icons/Close';
import {
  Box,
  Button,
  Drawer,
  Grid,
  IconButton,
  makeStyles,
  Theme,
  Typography,
  useMediaQuery,
  useTheme,
} from '@material-ui/core';
import { useTemplateString } from '../../hooks';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConfigurationDocs,
  ConfigurationDocsOptions,
} from './ConfigurationDocs';
import { ReactNode, useState } from 'react';

const useStyles = makeStyles(theme => ({
  drawerContent: {
    padding: theme.spacing(3),
    position: 'relative',
    height: '100%',
    width: '95vw',
    display: 'flex',
    flexDirection: 'column',

    [theme.breakpoints.up('md')]: {
      width: '60vw',
    },

    [theme.breakpoints.up('lg')]: {
      width: '45vw',
    },
  },
  drawerContentChildren: {
    flexGrow: 1,
    overflow: 'auto',
  },
  drawerCloseButton: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
  },
}));

export const Content = (props: { children: ReactNode }) => {
  return (
    <Grid item xs={12} lg={6}>
      {props.children}
    </Grid>
  );
};

const ExtraContent = (props: { children: ReactNode }) => {
  const classes = useStyles();

  const isScreenSmallerThanBreakpoint = useMediaQuery(
    (theme: Theme) => theme.breakpoints.down('md'),
    { noSsr: true },
  );
  const theme = useTheme();
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  return isScreenSmallerThanBreakpoint ? (
    <>
      <Grid item xs={12}>
        <Button variant="contained" onClick={() => setDrawerOpen(true)}>
          Show configuration docs
        </Button>
      </Grid>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        anchor="right"
        disableAutoFocus
        keepMounted
        variant="temporary"
      >
        <Box className={classes.drawerContent}>
          <IconButton
            className={classes.drawerCloseButton}
            aria-label="Close drawer"
            onClick={() => setDrawerOpen(false)}
          >
            <CloseIcon />
          </IconButton>
          <Typography
            variant="h6"
            component="h2"
            style={{ marginBottom: theme.spacing(2) }}
          >
            Configuration docs
          </Typography>
          <Box className={classes.drawerContentChildren}>{props.children}</Box>
        </Box>
      </Drawer>
    </>
  ) : (
    <Grid item lg={6}>
      {props.children}
    </Grid>
  );
};

type UiOptions =
  | {
      formWidth?: number;
      note?: string;
      configurationDocs?: ConfigurationDocsOptions;
    }
  | undefined;

export const StepLayout: LayoutTemplate = ({
  properties,
  description,
  formContext,
  uiSchema,
}) => {
  const uiOptions = uiSchema?.['ui:options'] as UiOptions;

  const {
    formWidth,
    note: noteTemplate = '',
    configurationDocs: configurationDocsOptions,
  } = uiOptions ?? {};

  const showExtraContent = Boolean(configurationDocsOptions);

  const allFormData = (formContext.formData as Record<string, any>) ?? {};
  const note = useTemplateString(noteTemplate, allFormData);

  return (
    <Box maxWidth={formWidth} mt={2}>
      {description || note ? (
        <Box marginBottom={2}>
          {description ? (
            <Typography variant="subtitle1" component="p">
              {description}
            </Typography>
          ) : null}
          {note ? (
            <Typography variant="body2">
              <MarkdownContent content={note} />
            </Typography>
          ) : null}
        </Box>
      ) : null}

      <QueryClientProvider>
        <ErrorsProvider>
          {showExtraContent ? (
            <Grid container spacing={3} direction="row-reverse">
              <ExtraContent>
                {configurationDocsOptions ? (
                  <ConfigurationDocs
                    configurationDocsOptions={configurationDocsOptions}
                    formContext={formContext}
                  />
                ) : null}
              </ExtraContent>
              <Content>
                <Grid container spacing={3} direction="column">
                  {properties.map(element => (
                    <Grid key={element.content.key} item xs={12}>
                      {element.content}
                    </Grid>
                  ))}
                </Grid>
              </Content>
            </Grid>
          ) : (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Grid container spacing={3} direction="column">
                  {properties.map(element => (
                    <Grid key={element.content.key} item xs={12}>
                      {element.content}
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            </Grid>
          )}
        </ErrorsProvider>
      </QueryClientProvider>
    </Box>
  );
};

import { useState } from 'react';
import { Box, makeStyles, Tab, Tabs, Typography } from '@material-ui/core';
import { useHelmChartValuesSchema } from '../../hooks/useHelmChartValuesSchema';
import { CodeSnippet, Progress } from '@backstage/core-components';
import { useHelmChartValuesYaml } from '../../hooks';
import { JsonSchemaViewer } from '../../UI';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

const lightBackgroundColor = '#f8f8f8';
const darkBackgroundColor = '#333333';

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
    height: '100%',

    [`${theme.breakpoints.up('lg')}`]: {
      paddingTop: '24px',
    },
  },
  tabsContainer: {
    height: '100%',
    position: 'relative',
  },
  tabsContainerInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor:
      theme.palette.type === 'light'
        ? lightBackgroundColor
        : darkBackgroundColor,
  },
  tabPanel: {
    '& code': {
      fontSize: '12px',
      lineHeight: '1.5',
    },

    '& pre': {
      margin: 0,
    },
  },
  codeContainer: {
    height: '100%',
    overflow: 'auto',
  },
}));

interface TabPanelProps {
  children?: React.ReactNode;
  index: any;
  value: any;
}

function TabPanel(props: TabPanelProps) {
  const classes = useStyles();
  const { children, value, index, ...other } = props;

  return (
    <Box
      className={classes.tabPanel}
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={2}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </Box>
  );
}

function a11yProps(index: number) {
  return {
    id: `tab-${index}`,
    'aria-controls': `tabpanel-${index}`,
  };
}

export type ConfigurationDocsOptions = {
  chartRef?: string;
  chartRefField?: string;
  chartTag?: string;
  chartTagField?: string;
};

export const ConfigurationDocs = ({
  configurationDocsOptions,
  formContext,
}: {
  configurationDocsOptions: ConfigurationDocsOptions;
  formContext: any;
}) => {
  const classes = useStyles();
  const [value, setValue] = useState(0);

  const {
    chartRef: chartRefOption,
    chartRefField: chartRefFieldOption,
    chartTag: chartTagOption,
    chartTagField: chartTagFieldOption,
  } = configurationDocsOptions ?? {};

  const chartRef = useValueFromOptions(
    formContext,
    chartRefOption,
    chartRefFieldOption,
  );

  const chartTag = useValueFromOptions(
    formContext,
    chartTagOption,
    chartTagFieldOption,
  );

  const { valuesYaml, isLoading: isLoadingValuesYaml } = useHelmChartValuesYaml(
    chartRef,
    chartTag,
  );
  const { schema: jsonSchema, isLoading: isLoadingJsonSchema } =
    useHelmChartValuesSchema(chartRef, chartTag);

  const handleChange = (_event: React.ChangeEvent<{}>, newValue: number) => {
    setValue(newValue);
  };

  return (
    <div className={classes.root}>
      <div className={classes.tabsContainer}>
        <div className={classes.tabsContainerInner}>
          <Box>
            <Tabs
              value={value}
              onChange={handleChange}
              indicatorColor="primary"
              aria-label="Configuration docs"
            >
              <Tab label="Defaults" {...a11yProps(0)} />
              <Tab label="Schema" {...a11yProps(1)} />
            </Tabs>
          </Box>
          <Box className={classes.codeContainer}>
            <TabPanel value={value} index={0}>
              {isLoadingValuesYaml && <Progress />}
              {!isLoadingValuesYaml && !valuesYaml && (
                <Typography variant="body1">No values.yaml found</Typography>
              )}
              {!isLoadingValuesYaml && valuesYaml && (
                <CodeSnippet
                  text={valuesYaml}
                  language="yaml"
                  customStyle={{
                    padding: 0,
                    background: 'unset',
                    overflowX: 'unset',
                  }}
                />
              )}
            </TabPanel>
            <TabPanel value={value} index={1}>
              {isLoadingJsonSchema && <Progress />}
              {!isLoadingJsonSchema && !jsonSchema && (
                <Typography variant="body1">No schema found</Typography>
              )}
              {!isLoadingJsonSchema && jsonSchema && (
                <JsonSchemaViewer jsonSchema={jsonSchema} />
              )}
            </TabPanel>
          </Box>
        </div>
      </div>
    </div>
  );
};

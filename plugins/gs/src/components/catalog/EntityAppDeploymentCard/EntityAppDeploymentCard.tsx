import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Button, makeStyles, Typography } from '@material-ui/core';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { QueryClientProvider } from '../../QueryClientProvider';
import { useCurrentEntityChart } from '../EntityChartContext';
import { useCreateAppDeploymentTemplate } from '../../hooks';

const useStyles = makeStyles(() => ({
  button: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
  },
}));

const CardContent = () => {
  const classes = useStyles();

  const { entity } = useEntity();
  const { charts, selectedChart } = useCurrentEntityChart();

  const { available, getTemplateUrl } = useCreateAppDeploymentTemplate();

  const formData: Record<string, string> = {
    entityRef: stringifyEntityRef(entity),
  };

  // Include chartRef only when entity has multiple charts
  if (charts.length > 1) {
    formData.chartRef = selectedChart.ref;
  }

  const href = getTemplateUrl(formData);

  return (
    <InfoCard title="Deploy application">
      {!available ? (
        <Typography variant="body2" color="textSecondary">
          App Deployment template not found
        </Typography>
      ) : (
        <Button
          variant="contained"
          disabled={!available}
          className={classes.button}
          color="primary"
          href={href}
        >
          Deploy application
        </Button>
      )}
    </InfoCard>
  );
};

export const EntityAppDeploymentCard = () => {
  return (
    <QueryClientProvider>
      <CardContent />
    </QueryClientProvider>
  );
};

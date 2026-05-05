import { AIChatButton } from '@giantswarm/backstage-plugin-ai-chat-react';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

export type ConfigureWithAiButtonOptions = {
  chartRef?: string;
  chartRefField?: string;
  chartTag?: string;
  chartTagField?: string;
  installationName?: string;
  installationNameField?: string;
  clusterName?: string;
  clusterNameField?: string;
};

export const ConfigureWithAiButton = ({
  configureWithAiOptions,
  formContext,
}: {
  configureWithAiOptions: ConfigureWithAiButtonOptions;
  formContext: any;
}) => {
  const {
    chartRef: chartRefOption,
    chartRefField: chartRefFieldOption,
    chartTag: chartTagOption,
    chartTagField: chartTagFieldOption,
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
    clusterName: clusterNameOption,
    clusterNameField: clusterNameFieldOption,
  } = configureWithAiOptions ?? {};

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

  const installationName = useValueFromOptions(
    formContext,
    installationNameOption,
    installationNameFieldOption,
  );

  const clusterName = useValueFromOptions(
    formContext,
    clusterNameOption,
    clusterNameFieldOption,
  );

  const message = [
    "I'm in the App Deployment template to deploy a chart to a cluster. Please help me create the configuration values as a starting point. Details:",
    '',
    `Chart: ${chartRef}`,
    `Version: ${chartTag}`,
    `Installation: ${installationName}`,
    `Cluster: ${clusterName}`,
  ].join('\n');

  return (
    <AIChatButton
      label="Configure with AI"
      variant="outlined"
      items={[{ message }]}
    />
  );
};

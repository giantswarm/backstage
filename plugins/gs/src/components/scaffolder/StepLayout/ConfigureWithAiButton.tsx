import { AIChatButton } from '@giantswarm/backstage-plugin-ai-chat-react';

type ConfigureWithAiButtonProps = {
  formData: Record<string, any>;
};

export const ConfigureWithAiButton = ({
  formData,
}: ConfigureWithAiButtonProps) => {
  const chartRef = formData.chartRef;
  const chartTag = formData.chartTag;
  const installationName = formData.installation?.installationName;
  const clusterName = formData.cluster?.clusterName;

  const message = [
    "I'm in the App Deployment template to deploy a chart to a cluster. Please help me create the configuration values as a starting point. Details:",
    '',
    `Chart: ${chartRef}`,
    `Version: ${chartTag}`,
    `Installation: ${installationName}`,
    `Cluster: ${clusterName}`,
    '',
    'Please separate non-confidential values from confdidential values clearly.',
  ].join('\n');

  return (
    <AIChatButton
      label="Configure with AI"
      variant="outlined"
      items={[{ message }]}
    />
  );
};

import { AIChatButton } from '@giantswarm/backstage-plugin-ai-chat-react';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import {
  buildConfigureWithAiMessage,
  ConfigureWithAiMode,
} from './buildConfigureWithAiMessage';

export type ConfigureWithAiButtonOptions = {
  mode?: ConfigureWithAiMode;
  chartRef?: string;
  chartRefField?: string;
  chartTag?: string;
  chartTagField?: string;
  installationName?: string;
  installationNameField?: string;
  clusterName?: string;
  clusterNameField?: string;
  deploymentName?: string;
  deploymentNameField?: string;
  deploymentNamespace?: string;
  deploymentNamespaceField?: string;
};

export const ConfigureWithAiButton = ({
  configureWithAiOptions,
  formContext,
}: {
  configureWithAiOptions: ConfigureWithAiButtonOptions;
  formContext: any;
}) => {
  const {
    mode,
    chartRef: chartRefOption,
    chartRefField: chartRefFieldOption,
    chartTag: chartTagOption,
    chartTagField: chartTagFieldOption,
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
    clusterName: clusterNameOption,
    clusterNameField: clusterNameFieldOption,
    deploymentName: deploymentNameOption,
    deploymentNameField: deploymentNameFieldOption,
    deploymentNamespace: deploymentNamespaceOption,
    deploymentNamespaceField: deploymentNamespaceFieldOption,
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

  const deploymentName = useValueFromOptions(
    formContext,
    deploymentNameOption,
    deploymentNameFieldOption,
  );

  const deploymentNamespace = useValueFromOptions(
    formContext,
    deploymentNamespaceOption,
    deploymentNamespaceFieldOption,
  );

  const message = buildConfigureWithAiMessage({
    mode,
    chartRef,
    chartTag,
    installationName,
    clusterName,
    deploymentName,
    deploymentNamespace,
  });

  return (
    <AIChatButton
      label="Configure with AI"
      variant="outlined"
      items={[{ message }]}
    />
  );
};

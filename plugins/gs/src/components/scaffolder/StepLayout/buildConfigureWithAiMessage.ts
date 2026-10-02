export type ConfigureWithAiMode = 'create' | 'edit';

export type ConfigureWithAiMessageParams = {
  mode?: ConfigureWithAiMode;
  chartRef?: string;
  chartTag?: string;
  installationName?: string;
  clusterName?: string;
  deploymentName?: string;
  deploymentNamespace?: string;
};

function detailLines(details: [string, string | undefined][]): string[] {
  return details
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`);
}

export function buildConfigureWithAiMessage({
  mode = 'create',
  chartRef,
  chartTag,
  installationName,
  clusterName,
  deploymentName,
  deploymentNamespace,
}: ConfigureWithAiMessageParams): string {
  if (mode === 'edit') {
    const helmRelease =
      deploymentNamespace && deploymentName
        ? `${deploymentNamespace}/${deploymentName}`
        : deploymentName;

    return [
      "I'm in the Edit App Deployment template to change the configuration of an existing deployment. Please read the HelmRelease's inline values and the ConfigMaps in its valuesFrom references, pull the current configuration from these resources, and help me adjust it. Refer to referenced Secrets by name only, never read their contents. Details:",
      '',
      ...detailLines([
        ['HelmRelease', helmRelease],
        ['Installation (management cluster)', installationName],
        ['Target cluster', clusterName],
        ['Chart', chartRef],
        ['Selected version', chartTag],
      ]),
    ].join('\n');
  }

  return [
    "I'm in the App Deployment template to deploy a chart to a cluster. Please help me create the configuration values as a starting point. Details:",
    '',
    ...detailLines([
      ['Chart', chartRef],
      ['Version', chartTag],
      ['Installation', installationName],
      ['Cluster', clusterName],
    ]),
  ].join('\n');
}

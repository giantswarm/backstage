import { buildConfigureWithAiMessage } from './buildConfigureWithAiMessage';

describe('buildConfigureWithAiMessage', () => {
  it('builds the create message by default', () => {
    const message = buildConfigureWithAiMessage({
      chartRef: 'gsoci.azurecr.io/charts/giantswarm/hello-world',
      chartTag: '2.11.0',
      installationName: 'gazelle',
      clusterName: 'operations',
    });

    expect(message).toBe(
      [
        "I'm in the App Deployment template to deploy a chart to a cluster. Please help me create the configuration values as a starting point. Details:",
        '',
        'Chart: gsoci.azurecr.io/charts/giantswarm/hello-world',
        'Version: 2.11.0',
        'Installation: gazelle',
        'Cluster: operations',
      ].join('\n'),
    );
  });

  it('builds the edit message with the HelmRelease reference', () => {
    const message = buildConfigureWithAiMessage({
      mode: 'edit',
      chartRef: 'gsoci.azurecr.io/charts/giantswarm/hello-world',
      chartTag: '2.12.0',
      installationName: 'gazelle',
      clusterName: 'operations',
      deploymentName: 'operations-hello-world',
      deploymentNamespace: 'org-giantswarm',
    });

    expect(message).toMatch(/^I'm in the Edit App Deployment template/);
    expect(message).toContain(
      'inline values and the ConfigMaps in its valuesFrom references',
    );
    expect(message).toContain(
      'Refer to referenced Secrets by name only, never read their contents.',
    );
    expect(message).toContain(
      'HelmRelease: org-giantswarm/operations-hello-world',
    );
    expect(message).toContain('Installation (management cluster): gazelle');
    expect(message).toContain('Target cluster: operations');
    expect(message).toContain(
      'Chart: gsoci.azurecr.io/charts/giantswarm/hello-world',
    );
    expect(message).toContain('Selected version: 2.12.0');
  });

  it('omits details without a value', () => {
    const createMessage = buildConfigureWithAiMessage({
      chartRef: 'gsoci.azurecr.io/charts/giantswarm/hello-world',
    });
    const editMessage = buildConfigureWithAiMessage({
      mode: 'edit',
      deploymentName: 'operations-hello-world',
    });

    expect(createMessage).not.toContain('undefined');
    expect(createMessage).not.toContain('Version:');
    expect(editMessage).not.toContain('undefined');
    expect(editMessage).toContain('HelmRelease: operations-hello-world');
    expect(editMessage).not.toContain('Target cluster:');
  });
});

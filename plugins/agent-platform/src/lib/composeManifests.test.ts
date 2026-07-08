import { composeManifests } from './composeManifests';

const model = {
  name: 'Go service reviewer',
  slug: 'go-service-reviewer',
  description: "Reviews pull requests on the platform team's Go services.",
  modelConfigName: 'opus-4-7',
  modelConfigNamespace: 'kagent',
  systemMessage: 'You review pull requests.\nRead for intent first.',
  skillRefs: [] as string[],
};

const ctx = {
  installation: 'gazelle',
  namespace: 'shared-agents',
  chartOciUrl: 'oci://gsoci.azurecr.io/giantswarm/charts/general-purpose-agent',
  chartVersion: '1.4.2',
};

describe('composeManifests', () => {
  it('emits a HelmRelease and an OCIRepository under the installation path', () => {
    const { files } = composeManifests(model, ctx);

    expect(files).toHaveLength(2);
    const [helmRelease, ociRepository] = files;

    expect(helmRelease.path).toBe(
      'clusters/gazelle/shared-agents/go-service-reviewer.yaml',
    );
    expect(helmRelease.content).toContain('kind: HelmRelease');
    expect(helmRelease.content).toContain('name: go-service-reviewer');
    expect(helmRelease.content).toContain('namespace: shared-agents');

    expect(ociRepository.path).toBe(
      'clusters/gazelle/shared-agents/general-purpose-agent.yaml',
    );
    expect(ociRepository.content).toContain('kind: OCIRepository');
    expect(ociRepository.content).toContain('tag: 1.4.2');
  });

  it('inlines the agent values into the HelmRelease, with a block-scalar prompt', () => {
    const { files } = composeManifests(model, ctx);
    const helmRelease = files[0].content;

    expect(helmRelease).toContain('  values:');
    expect(helmRelease).toContain('    agent:');
    expect(helmRelease).toContain('      displayName: "Go service reviewer"');
    expect(helmRelease).toContain('      modelConfig:');
    expect(helmRelease).toContain('        name: "opus-4-7"');
    expect(helmRelease).toContain('        namespace: "kagent"');
    expect(helmRelease).toContain('      systemMessage: |-');
    expect(helmRelease).toContain('        You review pull requests.');
    expect(helmRelease).toContain('      skills:');
    expect(helmRelease).toContain('        refs: []');
  });

  it('renders skill refs as a YAML list when present', () => {
    const { valuesYaml } = composeManifests(
      {
        ...model,
        skillRefs: ['gsoci.azurecr.io/giantswarm/skills/pr-review:2.0.0'],
      },
      ctx,
    );

    expect(valuesYaml).toContain('  skills:');
    expect(valuesYaml).toContain('    refs:');
    expect(valuesYaml).toContain(
      '      - "gsoci.azurecr.io/giantswarm/skills/pr-review:2.0.0"',
    );
  });

  it('builds a helm install command that points at the values file', () => {
    const { helmInstallCommand } = composeManifests(model, ctx);

    expect(helmInstallCommand).toContain('helm install go-service-reviewer');
    expect(helmInstallCommand).toContain('--version 1.4.2');
    expect(helmInstallCommand).toContain('--namespace shared-agents');
    expect(helmInstallCommand).toContain(
      '--values go-service-reviewer-values.yaml',
    );
  });
});

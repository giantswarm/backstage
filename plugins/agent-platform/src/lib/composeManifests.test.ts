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

// The namespace is derived from the selected ModelConfig's namespace by the
// caller; composeManifests just receives it.
const ctx = {
  installation: 'gazelle',
  namespace: 'kagent',
  chartOciUrl: 'oci://gsoci.azurecr.io/giantswarm/charts/general-purpose-agent',
  chartVersion: '1.4.2',
};

describe('composeManifests', () => {
  it('emits a HelmRelease and an OCIRepository in the target namespace', () => {
    const { files } = composeManifests(model, ctx);

    expect(files).toHaveLength(2);
    const [helmRelease, ociRepository] = files;

    expect(helmRelease.filename).toBe('go-service-reviewer.yaml');
    expect(helmRelease.content).toContain('kind: HelmRelease');
    expect(helmRelease.content).toContain('name: go-service-reviewer');
    expect(helmRelease.content).toContain('namespace: kagent');

    expect(ociRepository.filename).toBe('general-purpose-agent.yaml');
    expect(ociRepository.content).toContain('kind: OCIRepository');
    expect(ociRepository.content).toContain('tag: 1.4.2');
  });

  it('sets spec.serviceAccountName on the HelmRelease only when provided', () => {
    const without = composeManifests(model, ctx).files[0].content;
    expect(without).not.toContain('serviceAccountName');

    const withSa = composeManifests(model, {
      ...ctx,
      serviceAccountName: 'kagent-controller',
    }).files[0].content;
    expect(withSa).toContain('serviceAccountName: kagent-controller');
    // Sits at the spec level (2-space indent), not inside values.
    expect(withSa).toContain('\n  serviceAccountName: kagent-controller\n');
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

  it('combines both resources into one multi-document manifest for direct apply', () => {
    const { combinedManifest } = composeManifests(model, ctx);

    // OCIRepository first, then the HelmRelease, separated by a YAML doc marker.
    const ociIndex = combinedManifest.indexOf('kind: OCIRepository');
    const hrIndex = combinedManifest.indexOf('kind: HelmRelease');
    expect(ociIndex).toBeGreaterThanOrEqual(0);
    expect(hrIndex).toBeGreaterThan(ociIndex);
    expect(combinedManifest).toContain('\n---\n');
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

  it('builds a helm install command that creates the namespace', () => {
    const { helmInstallCommand } = composeManifests(model, ctx);

    expect(helmInstallCommand).toContain('helm install go-service-reviewer');
    expect(helmInstallCommand).toContain('--version 1.4.2');
    expect(helmInstallCommand).toContain('--namespace kagent');
    expect(helmInstallCommand).toContain('--create-namespace');
    expect(helmInstallCommand).toContain(
      '--values go-service-reviewer-values.yaml',
    );
  });
});

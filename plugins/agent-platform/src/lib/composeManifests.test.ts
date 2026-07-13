import { composeManifests } from './composeManifests';

const model = {
  name: 'Go service reviewer',
  slug: 'go-service-reviewer',
  description: "Reviews pull requests on the platform team's Go services.",
  modelConfigName: 'opus-4-7',
  systemMessage: 'You review pull requests.\nRead for intent first.',
  skills: [] as {
    url: string;
    path: string;
    ref: string;
    name: string;
  }[],
};

// The namespace is derived from the selected ModelConfig's namespace by the
// caller; composeManifests just receives it.
const ctx = {
  installation: 'gazelle',
  namespace: 'kagent',
  chartOciUrl: 'oci://gsoci.azurecr.io/charts/giantswarm/agent',
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

    expect(ociRepository.filename).toBe('agent.yaml');
    expect(ociRepository.content).toContain('kind: OCIRepository');
    expect(ociRepository.content).toContain('name: agent');
    expect(ociRepository.content).toContain(
      'url: oci://gsoci.azurecr.io/charts/giantswarm/agent',
    );
    // Tracks a semver range for auto-upgrade, not a pinned tag.
    expect(ociRepository.content).toContain('semver: "x.x.x"');
    expect(ociRepository.content).not.toContain('tag:');
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
    // agent block (inlined at spec.values, +4 indent).
    expect(helmRelease).toContain('    agent:');
    expect(helmRelease).toContain('      name: "go-service-reviewer"');
    expect(helmRelease).toContain('      displayName: "Go service reviewer"');
    expect(helmRelease).toContain('      systemMessage: |-');
    expect(helmRelease).toContain('        You review pull requests.');
    // modelConfig is a top-level values key (name only — no namespace), not
    // nested under agent.
    expect(helmRelease).toContain('    modelConfig:');
    expect(helmRelease).toContain('      name: "opus-4-7"');
    expect(helmRelease).not.toContain('      modelConfig:');
    expect(helmRelease).not.toContain('namespace: "kagent"');
    // No skills selected → the skills block is omitted entirely (gitRefs
    // requires at least one entry).
    expect(helmRelease).not.toContain('skills:');
  });

  it('omits agent.systemMessage when the prompt is empty (chart default applies)', () => {
    const helmRelease = composeManifests(
      { ...model, systemMessage: '   ' },
      ctx,
    ).files[0].content;

    expect(helmRelease).not.toContain('systemMessage');
    // The rest of the agent block is still emitted.
    expect(helmRelease).toContain('      displayName: "Go service reviewer"');
    expect(helmRelease).toContain('    modelConfig:');
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

  it('renders selected skills as spec.skills.gitRefs when present', () => {
    const { valuesYaml } = composeManifests(
      {
        ...model,
        skills: [
          {
            url: 'https://github.com/giantswarm/agent-skills',
            path: 'demo',
            ref: 'main',
            name: 'demo',
          },
        ],
      },
      ctx,
    );

    // skills is a top-level values key (not under agent).
    expect(valuesYaml).toContain('skills:');
    expect(valuesYaml).toContain('  gitRefs:');
    expect(valuesYaml).toContain(
      '    - url: "https://github.com/giantswarm/agent-skills"',
    );
    expect(valuesYaml).toContain('      path: "demo"');
    expect(valuesYaml).toContain('      ref: "main"');
    expect(valuesYaml).toContain('      name: "demo"');
  });

  it('omits path for a repo-root skill', () => {
    const { valuesYaml } = composeManifests(
      {
        ...model,
        skills: [
          {
            url: 'https://github.com/giantswarm/agent-skills',
            path: '',
            ref: 'main',
            name: 'agent-skills',
          },
        ],
      },
      ctx,
    );

    expect(valuesYaml).toContain('  gitRefs:');
    expect(valuesYaml).not.toContain('path:');
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

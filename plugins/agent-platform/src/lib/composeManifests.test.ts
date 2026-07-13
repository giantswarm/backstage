import { load, loadAll } from 'js-yaml';
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

/** Parses a single-document manifest string into an object. */
function parse(content: string): any {
  return load(content);
}

describe('composeManifests', () => {
  it('emits a HelmRelease and an OCIRepository in the target namespace', () => {
    const { files } = composeManifests(model, ctx);

    expect(files).toHaveLength(2);
    const [helmRelease, ociRepository] = files;

    expect(helmRelease.filename).toBe('go-service-reviewer.yaml');
    const hr = parse(helmRelease.content);
    expect(hr.kind).toBe('HelmRelease');
    expect(hr.metadata.name).toBe('go-service-reviewer');
    expect(hr.metadata.namespace).toBe('kagent');

    expect(ociRepository.filename).toBe('agent.yaml');
    const oci = parse(ociRepository.content);
    expect(oci.kind).toBe('OCIRepository');
    expect(oci.metadata.name).toBe('agent');
    expect(oci.spec.url).toBe('oci://gsoci.azurecr.io/charts/giantswarm/agent');
    // Tracks a semver range for auto-upgrade, not a pinned tag.
    expect(oci.spec.ref).toEqual({ semver: 'x.x.x' });
    expect(oci.spec.ref.tag).toBeUndefined();
  });

  it('sets spec.serviceAccountName on the HelmRelease only when provided', () => {
    const without = parse(composeManifests(model, ctx).files[0].content);
    expect(without.spec.serviceAccountName).toBeUndefined();

    const withSa = parse(
      composeManifests(model, {
        ...ctx,
        serviceAccountName: 'kagent-controller',
      }).files[0].content,
    );
    expect(withSa.spec.serviceAccountName).toBe('kagent-controller');
  });

  it('inlines the agent values into the HelmRelease at spec.values', () => {
    const hr = parse(composeManifests(model, ctx).files[0].content);
    const values = hr.spec.values;

    expect(values.agent.name).toBe('go-service-reviewer');
    expect(values.agent.displayName).toBe('Go service reviewer');
    expect(values.agent.systemMessage).toBe(
      'You review pull requests.\nRead for intent first.',
    );
    // modelConfig is a top-level values key (name only — no namespace).
    expect(values.modelConfig).toEqual({ name: 'opus-4-7' });
    expect(values.agent.modelConfig).toBeUndefined();
    // No skills selected → the skills block is omitted (gitRefs requires ≥1).
    expect(values.skills).toBeUndefined();
  });

  it('omits agent.systemMessage when the prompt is empty (chart default applies)', () => {
    const hr = parse(
      composeManifests({ ...model, systemMessage: '   ' }, ctx).files[0]
        .content,
    );
    expect(hr.spec.values.agent.systemMessage).toBeUndefined();
    expect(hr.spec.values.agent.displayName).toBe('Go service reviewer');
    expect(hr.spec.values.modelConfig.name).toBe('opus-4-7');
  });

  it('produces valid YAML even when the prompt has irregular indentation', () => {
    // A prompt whose first content line is more indented than a later line used
    // to break the hand-rolled block scalar (invalid YAML). yaml.dump handles it.
    const trickyPrompt = '  Indented intro line\nLess indented instruction';
    const { files, combinedManifest } = composeManifests(
      { ...model, systemMessage: trickyPrompt },
      ctx,
    );

    // Round-trips cleanly and preserves the prompt verbatim.
    const hr = parse(files[0].content);
    expect(hr.spec.values.agent.systemMessage).toBe(trickyPrompt);
    // The combined multi-doc manifest also parses (what kube:apply loads).
    expect(() => loadAll(combinedManifest)).not.toThrow();
  });

  it('combines both resources into one multi-document manifest for direct apply', () => {
    const { combinedManifest } = composeManifests(model, ctx);

    const docs = loadAll(combinedManifest) as any[];
    expect(docs).toHaveLength(2);
    // OCIRepository first, then the HelmRelease.
    expect(docs[0].kind).toBe('OCIRepository');
    expect(docs[1].kind).toBe('HelmRelease');
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

    const values = parse(valuesYaml);
    expect(values.skills.gitRefs).toEqual([
      {
        url: 'https://github.com/giantswarm/agent-skills',
        path: 'demo',
        ref: 'main',
        name: 'demo',
      },
    ]);
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

    const [skill] = parse(valuesYaml).skills.gitRefs;
    expect(skill.path).toBeUndefined();
    expect(skill).toEqual({
      url: 'https://github.com/giantswarm/agent-skills',
      ref: 'main',
      name: 'agent-skills',
    });
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

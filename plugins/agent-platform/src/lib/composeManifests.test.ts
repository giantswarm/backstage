import { load, loadAll } from 'js-yaml';
import {
  AgentModel,
  composeManifests,
  DEFAULT_GATEWAY_SPEC,
  DeployContext,
  needsToolsetServer,
  toolsetServerName,
} from './composeManifests';

const model: AgentModel = {
  name: 'PR reviewer',
  slug: 'pr-reviewer',
  description: 'Reviews pull requests.',
  modelConfigName: 'opus-4-7',
  systemMessage: 'You review pull requests.',
  iconUrl: 'https://avatars.example.io/pr-reviewer.svg',
  skills: [],
  toolset: [],
};

const ctx: DeployContext = {
  installation: 'gazelle',
  namespace: 'kagent',
  gateway: {
    name: 'muster',
    spec: {
      url: 'http://muster.agent-platform.svc.cluster.local:8090/mcp',
      protocol: 'STREAMABLE_HTTP',
      timeout: '30s',
    },
  },
};

type Doc = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: Record<string, any>;
};

function docs(manifest: string): Doc[] {
  return loadAll(manifest) as Doc[];
}

describe('composeManifests', () => {
  it('emits one v1alpha3 AgentTemplate in the target namespace, admitted by the default harness', () => {
    const { files, combinedManifest } = composeManifests(model, ctx);

    expect(files.map(f => f.filename)).toEqual(['pr-reviewer.yaml']);
    expect(files[0].path).toBe('clusters/gazelle/kagent/pr-reviewer.yaml');

    const [template] = docs(combinedManifest);
    expect(template).toMatchObject({
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'AgentTemplate',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'kagent',
        labels: { 'kagent.dev/harness': 'kagent' },
        annotations: {
          'ui.giantswarm.io/display-name': 'PR reviewer',
          'ui.giantswarm.io/icon-url': 'https://avatars.example.io/pr-reviewer.svg',
        },
      },
      spec: {
        modelConfig: { name: 'opus-4-7' },
        description: 'Reviews pull requests.',
        systemPrompt: 'You review pull requests.',
      },
    });
  });

  it('binds the platform gateway directly when no toolset is declared (implicit full access)', () => {
    const [template] = docs(composeManifests(model, ctx).combinedManifest);
    expect(template.spec.tools).toEqual([
      { mcp: { server: { kind: 'RemoteMCPServer', name: 'muster' } } },
    ]);
  });

  it('honours the harness the form picked', () => {
    const [template] = docs(
      composeManifests({ ...model, harness: 'claude' }, ctx).combinedManifest,
    );
    expect(template.metadata.labels).toEqual({ 'kagent.dev/harness': 'claude' });
  });

  it('omits the icon annotation, description and prompt when they are empty', () => {
    const [template] = docs(
      composeManifests(
        { ...model, iconUrl: '', description: '  ', systemMessage: '' },
        ctx,
      ).combinedManifest,
    );
    expect(template.metadata.annotations).toEqual({
      'ui.giantswarm.io/display-name': 'PR reviewer',
    });
    expect(template.spec).not.toHaveProperty('description');
    expect(template.spec).not.toHaveProperty('systemPrompt');
  });

  it('produces valid YAML even when the prompt has irregular indentation', () => {
    const systemMessage = 'Line one\n    indented\n  less indented\n\ttab';
    const { combinedManifest } = composeManifests(
      { ...model, systemMessage },
      ctx,
    );
    const [template] = docs(combinedManifest);
    expect(template.spec.systemPrompt).toBe(systemMessage);
  });

  it('renders selected skills as pinned git sources, omitting an empty path', () => {
    const sha = 'a'.repeat(40);
    const [template] = docs(
      composeManifests(
        {
          ...model,
          skills: [
            {
              url: 'https://github.com/giantswarm/skills',
              path: 'pr/review',
              ref: sha,
              name: 'pr-review',
            },
            {
              url: 'https://github.com/giantswarm/root-skill',
              path: '',
              ref: sha,
              name: 'root',
            },
          ],
        },
        ctx,
      ).combinedManifest,
    );
    expect(template.spec.skills).toEqual([
      {
        name: 'pr-review',
        source: {
          git: { url: 'https://github.com/giantswarm/skills', commit: sha },
          path: 'pr/review',
        },
      },
      {
        name: 'root',
        source: {
          git: { url: 'https://github.com/giantswarm/root-skill', commit: sha },
        },
      },
    ]);
  });

  it('builds a kubectl apply command for the manual fallback', () => {
    expect(composeManifests(model, ctx).applyCommand).toBe(
      'kubectl apply --namespace kagent \\\n  --filename pr-reviewer.yaml',
    );
  });
});

describe('composeManifests toolset', () => {
  const withToolset = {
    ...model,
    toolset: ['preset:read-only', 'server:kubernetes', 'tool:x_get_pods'],
  };

  it('emits a RemoteMCPServer copy of the gateway carrying the header, then the template binding it', () => {
    const { files, combinedManifest } = composeManifests(withToolset, ctx);

    expect(files.map(f => f.filename)).toEqual([
      'muster-pr-reviewer.yaml',
      'pr-reviewer.yaml',
    ]);
    const [server, template] = docs(combinedManifest);

    expect(server).toMatchObject({
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'RemoteMCPServer',
      metadata: {
        name: 'muster-pr-reviewer',
        namespace: 'kagent',
        labels: {
          'agent-platform.giantswarm.io/agent': 'pr-reviewer',
          'kagent.dev/discovery': 'disabled',
        },
      },
      spec: {
        url: 'http://muster.agent-platform.svc.cluster.local:8090/mcp',
        protocol: 'STREAMABLE_HTTP',
        timeout: '30s',
        headersFrom: [
          {
            name: 'X-Muster-Toolset',
            value: 'preset:read-only,server:kubernetes,tool:x_get_pods',
          },
        ],
      },
    });
    expect(template.spec.tools).toEqual([
      { mcp: { server: { kind: 'RemoteMCPServer', name: 'muster-pr-reviewer' } } },
    ]);
  });

  it('never copies an Authorization header and replaces an existing toolset header', () => {
    const [server] = docs(
      composeManifests(withToolset, {
        ...ctx,
        gateway: {
          name: 'muster',
          spec: {
            url: 'http://muster:8090/mcp',
            headersFrom: [
              { name: 'Authorization', value: 'Bearer nope' },
              { name: 'X-Muster-Toolset', value: 'preset:full' },
              { name: 'X-Trace', value: 'keep' },
            ],
          },
        },
      }).combinedManifest,
    );
    expect(server.spec.headersFrom).toEqual([
      { name: 'X-Trace', value: 'keep' },
      {
        name: 'X-Muster-Toolset',
        value: 'preset:read-only,server:kubernetes,tool:x_get_pods',
      },
    ]);
  });

  it('falls back to the platform in-cluster muster URL when the gateway could not be read', () => {
    const [server] = docs(
      composeManifests(withToolset, { ...ctx, gateway: undefined })
        .combinedManifest,
    );
    expect(server.spec).toMatchObject(DEFAULT_GATEWAY_SPEC);
  });

  it('binds no tools at all for a chat-only agent (preset:none)', () => {
    const { files, combinedManifest } = composeManifests(
      { ...model, toolset: ['preset:none'] },
      ctx,
    );
    expect(files).toHaveLength(1);
    const [template] = docs(combinedManifest);
    expect(template.spec).not.toHaveProperty('tools');
  });

  it('names the copy after the agent and knows when one is needed', () => {
    expect(toolsetServerName('pr-reviewer')).toBe('muster-pr-reviewer');
    expect(needsToolsetServer([])).toBe(false);
    expect(needsToolsetServer(['preset:none'])).toBe(false);
    expect(needsToolsetServer(['preset:read-only'])).toBe(true);
  });

  it('keeps the combined manifest loadable as two documents', () => {
    const { combinedManifest } = composeManifests(withToolset, ctx);
    expect(docs(combinedManifest).map(d => d.kind)).toEqual([
      'RemoteMCPServer',
      'AgentTemplate',
    ]);
    // Each file alone is a single document.
    for (const file of composeManifests(withToolset, ctx).files) {
      expect(load(file.content)).toBeTruthy();
    }
  });
});

// Composes the manifests for a new agent from the create-form model.
//
// On kagent `main` the agent unit is a `kagent.dev/v1alpha3 AgentTemplate`: the
// model config, the system prompt, the tool bindings and the skills, admitted by a
// Harness through the `kagent.dev/harness` label and instantiated per
// conversation. There is no per-agent Helm release any more.
//
// A toolset is a copy of the platform's muster `RemoteMCPServer` that carries the
// `X-Muster-Toolset` header — kagent `main` puts the headers an agent calls a
// server with on the server, not on the binding — so an agent with a toolset gets
// two objects: the `RemoteMCPServer muster-<agent>` and a template that binds it.
// Without a toolset the template binds the platform's `muster` directly (implicit
// full access, as the gateway grants it to the caller); `preset:none` binds no
// tools at all.
//
// The default deploy path applies these resources directly to the selected
// installation via the `kube:apply` scaffolder action, as the signed-in person, so
// `combinedManifest` is the source of truth: one multi-document YAML that is both
// previewed on the review page and applied verbatim — what you see is what gets
// applied. The same resources are exposed as individual `files` (for the review
// cards) and the fallback is a `kubectl apply` of the same documents.
//
// Manifests are built as plain objects and serialized with `yaml.dump`, never
// by string concatenation — js-yaml handles quoting, escaping and (critically)
// block-scalar indentation, so arbitrary system prompts can't produce invalid
// YAML.

import { dump } from 'js-yaml';
import { PRESET_NONE, TOOLSET_HEADER } from './toolset';

export type AgentModel = {
  name: string;
  slug: string;
  description: string;
  modelConfigName: string;
  systemMessage: string;
  iconUrl: string;
  /** Selected skills → `spec.skills[]`. Empty → the block is omitted. */
  skills: AgentSkillRef[];
  /**
   * The toolset selectors, verbatim and in order. Empty → the template binds
   * the gateway directly (implicit full access); exactly `preset:none` → no
   * tools; anything else → a `RemoteMCPServer` copy carrying the header.
   */
  toolset: string[];
  /**
   * The Harness that admits the template, via the `kagent.dev/harness` label.
   * Defaults to {@link DEFAULT_HARNESS}.
   */
  harness?: string;
};

/**
 * One selected skill, as the picker hands it over. kagent `main` mounts a skill
 * from a **pinned commit** (`spec.skills[].source.git.commit`, a 40- or
 * 64-character hex SHA) — a branch or tag is not accepted by the CRD, so `ref`
 * is expected to be a commit.
 */
export type AgentSkillRef = {
  /** Git repository URL. */
  url: string;
  /** Subdirectory within the repo (skill root); omitted from YAML when ''. */
  path: string;
  /** The pinned commit SHA. */
  ref: string;
  /** Skill directory name under /skills. */
  name: string;
};

/** The platform's gateway `RemoteMCPServer`, as read from the installation. */
export type GatewayServer = {
  name: string;
  /** Its spec, copied verbatim into the toolset server (headers aside). */
  spec: Record<string, unknown>;
};

export type DeployContext = {
  /** Installation / management cluster name (applied to; used in file paths). */
  installation: string;
  /**
   * Namespace the AgentTemplate (and its toolset server) are placed in. kagent
   * `main` binds tools and model configs same-namespace, so this is the
   * namespace of the selected ModelConfig — which is where kagent watches.
   */
  namespace: string;
  /**
   * The platform's muster gateway server on that installation, when it could
   * be read. A toolset copies its spec; without it the copy falls back to the
   * platform's in-cluster muster URL.
   */
  gateway?: GatewayServer;
};

export type ComposedFile = {
  /** Repo-relative path the file lands at. */
  path: string;
  /** Just the file name, for the card header. */
  filename: string;
  content: string;
};

export type ComposedManifests = {
  files: ComposedFile[];
  /**
   * Single multi-document YAML (the toolset `RemoteMCPServer` when there is one,
   * then the `AgentTemplate`) applied verbatim by the direct-apply path. This is
   * what the review page previews.
   */
  combinedManifest: string;
  /** The same documents applied by hand, for the manual fallback. */
  applyCommand: string;
};

/** The v1alpha3 API every composed object is written at. */
export const KAGENT_API_VERSION = 'kagent.dev/v1alpha3';

/** The Harness a new agent is admitted by unless the form says otherwise. */
export const DEFAULT_HARNESS = 'kagent';

/** The platform's gateway server name, and the prefix of every toolset copy. */
export const GATEWAY_SERVER_NAME = 'muster';

/**
 * Where the platform's muster listens in-cluster when the gateway server could
 * not be read from the installation. The agent-platform-connectivity chart renders
 * exactly this URL on its `RemoteMCPServer muster`.
 */
export const DEFAULT_GATEWAY_SPEC: Record<string, unknown> = {
  url: 'http://muster.agent-platform.svc.cluster.local:8090/mcp',
  protocol: 'STREAMABLE_HTTP',
};

const YAML_OPTS = { lineWidth: -1, noRefs: true } as const;

/** Name of the toolset copy of the gateway server for one agent. */
export function toolsetServerName(slug: string): string {
  return `${GATEWAY_SERVER_NAME}-${slug}`;
}

/** Whether the model's toolset is exactly "no tools". */
function isChatOnly(toolset: string[]): boolean {
  return toolset.length === 1 && toolset[0] === PRESET_NONE;
}

/** Whether the model declares a toolset that needs a header, i.e. a server copy. */
export function needsToolsetServer(toolset: string[]): boolean {
  return toolset.length > 0 && !isChatOnly(toolset);
}

/**
 * The toolset copy of the gateway server: the platform's spec, plus the
 * `X-Muster-Toolset` header naming the selectors. Never a header named
 * `Authorization` — the caller's own bearer is the only one, and kagent applies
 * `headersFrom` last, so such a header would override the person.
 */
function buildToolsetServer(
  model: AgentModel,
  ctx: DeployContext,
): Record<string, unknown> {
  const base = { ...(ctx.gateway?.spec ?? DEFAULT_GATEWAY_SPEC) };
  const inherited = Array.isArray(base.headersFrom)
    ? (base.headersFrom as Array<{ name: string }>).filter(
        header =>
          header.name.toLowerCase() !== TOOLSET_HEADER.toLowerCase() &&
          header.name.toLowerCase() !== 'authorization',
      )
    : [];
  return {
    apiVersion: KAGENT_API_VERSION,
    kind: 'RemoteMCPServer',
    metadata: {
      name: toolsetServerName(model.slug),
      namespace: ctx.namespace,
      labels: {
        'agent-platform.giantswarm.io/agent': model.slug,
        // Discovery stays off: the gateway needs the person's OAuth, which no
        // controller has. Same as the platform's own `muster` server.
        'kagent.dev/discovery': 'disabled',
      },
    },
    spec: {
      ...base,
      description: `Muster gateway for agent ${model.slug} (toolset copy)`,
      headersFrom: [
        ...inherited,
        { name: TOOLSET_HEADER, value: model.toolset.join(',') },
      ],
    },
  };
}

function buildTemplate(model: AgentModel, ctx: DeployContext): Record<string, unknown> {
  const annotations: Record<string, string> = {
    'ui.giantswarm.io/display-name': model.name,
  };
  if (model.iconUrl.trim()) {
    annotations['ui.giantswarm.io/icon-url'] = model.iconUrl;
  }

  const spec: Record<string, unknown> = {
    modelConfig: { name: model.modelConfigName },
  };
  if (model.description.trim()) {
    spec.description = model.description;
  }
  if (model.systemMessage.trim()) {
    spec.systemPrompt = model.systemMessage;
  }

  if (!isChatOnly(model.toolset)) {
    const serverName = needsToolsetServer(model.toolset)
      ? toolsetServerName(model.slug)
      : ctx.gateway?.name ?? GATEWAY_SERVER_NAME;
    spec.tools = [
      { mcp: { server: { kind: 'RemoteMCPServer', name: serverName } } },
    ];
  }

  if (model.skills.length > 0) {
    spec.skills = model.skills.map(skill => ({
      name: skill.name,
      source: {
        git: { url: skill.url, commit: skill.ref },
        ...(skill.path ? { path: skill.path } : {}),
      },
    }));
  }

  return {
    apiVersion: KAGENT_API_VERSION,
    kind: 'AgentTemplate',
    metadata: {
      name: model.slug,
      namespace: ctx.namespace,
      labels: { 'kagent.dev/harness': model.harness ?? DEFAULT_HARNESS },
      annotations,
    },
    spec,
  };
}

function buildApplyCommand(model: AgentModel, ctx: DeployContext): string {
  return `kubectl apply --namespace ${ctx.namespace} \\
  --filename ${model.slug}.yaml`;
}

export function composeManifests(
  model: AgentModel,
  ctx: DeployContext,
): ComposedManifests {
  const dir = `clusters/${ctx.installation}/${ctx.namespace}`;

  const files: ComposedFile[] = [];
  if (needsToolsetServer(model.toolset)) {
    files.push({
      path: `${dir}/${toolsetServerName(model.slug)}.yaml`,
      filename: `${toolsetServerName(model.slug)}.yaml`,
      content: dump(buildToolsetServer(model, ctx), YAML_OPTS),
    });
  }
  files.push({
    path: `${dir}/${model.slug}.yaml`,
    filename: `${model.slug}.yaml`,
    content: dump(buildTemplate(model, ctx), YAML_OPTS),
  });

  return {
    files,
    // The server first: the template's binding resolves against it, and kagent
    // reports ResolvedRefs=False until it exists.
    combinedManifest: files.map(file => file.content).join('---\n'),
    applyCommand: buildApplyCommand(model, ctx),
  };
}

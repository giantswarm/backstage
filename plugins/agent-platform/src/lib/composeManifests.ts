// Composes the manifests for a new agent from the create-form model.
//
// The default deploy path applies these resources directly to the selected
// installation via the `kube:apply` scaffolder action, so `combinedManifest` is
// the source of truth: a single multi-document YAML (Namespace + OCIRepository +
// HelmRelease) that is both previewed on the review page and applied verbatim —
// what you see is what gets applied. The same resources are also exposed as
// individual `files` (for the review cards) and as a standalone values block +
// `helm install` command for the manual fallback.
//
// We inline the agent values into `HelmRelease.spec.values` rather than
// referencing a ConfigMap (the prototype's dangling reference), which is the
// common self-contained Flux pattern. The values follow the `agent` chart's
// schema (github.com/giantswarm/agent, helm/agent): `agent`, `modelConfig` and
// `skills` are top-level keys. The chart isn't released to the OCI registry
// yet, so the URL/version are provisional even though the values shape is now
// authoritative.

export type AgentModel = {
  /** Display name (agent.displayName). */
  name: string;
  /** URL-friendly identifier; also the HelmRelease/release name. */
  slug: string;
  description: string;
  /**
   * ModelConfig CR name (chart `modelConfig.name`). The chart resolves it in
   * the agent's own namespace, so no namespace is passed in the values — the
   * agent is deployed into the ModelConfig's namespace instead (see
   * DeployContext.namespace).
   */
  modelConfigName: string;
  /** System message (agent.systemMessage). */
  systemMessage: string;
  /** Selected skills → agent.skills.gitRefs. Empty → the block is omitted. */
  skills: AgentSkillRef[];
};

/**
 * A kagent `spec.skills.gitRefs` entry: a git repo + subdirectory to materialize
 * as a skill under `/skills`. Emitted into the chart values as
 * `agent.skills.gitRefs`.
 */
export type AgentSkillRef = {
  /** Git repository URL. */
  url: string;
  /** Subdirectory within the repo (skill root); omitted from YAML when ''. */
  path: string;
  /** Git ref (branch/tag/SHA); omitted from YAML when ''. */
  ref: string;
  /** Skill directory name under /skills. */
  name: string;
};

export type DeployContext = {
  /** Installation / management cluster name (applied to; used in file paths). */
  installation: string;
  /**
   * Namespace the HelmRelease/OCIRepository are placed in. Derived from the
   * selected ModelConfig's namespace so the agent is co-located with it (and
   * where kagent watches). With `targetNamespace` unset, Flux also deploys the
   * chart's output here.
   */
  namespace: string;
  /** Chart OCI URL without a tag. */
  chartOciUrl: string;
  /**
   * Concrete latest chart version, used only for the manual `helm install`
   * snapshot. The Flux OCIRepository does not pin it — it tracks a semver range
   * and auto-upgrades to the latest published release.
   */
  chartVersion: string;
  /**
   * ServiceAccount the HelmRelease runs as. Required by GS's Flux
   * multi-tenancy admission policy for HelmReleases in tenant namespaces
   * (which the ModelConfig namespace is). Omitted from the manifest when unset.
   */
  serviceAccountName?: string;
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
   * Single multi-document YAML (OCIRepository + HelmRelease) applied verbatim by
   * the direct-apply path. This is what the review page previews.
   */
  combinedManifest: string;
  /** Standalone agent values (for the manual `helm install --values` path). */
  valuesYaml: string;
  helmInstallCommand: string;
};

const CHART_NAME = 'agent';

// The OCIRepository tracks the chart by semver range rather than a pinned tag,
// so Flux automatically upgrades the agent to the latest published release
// (GS "major upgrades" convention: every position is a wildcard).
const CHART_SEMVER_RANGE = 'x.x.x';

/** Double-quoted YAML scalar with JSON-compatible escaping. */
function quote(value: string): string {
  return JSON.stringify(value);
}

/** Indent every non-empty line of a block by `spaces`. */
function indent(block: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return block
    .split('\n')
    .map(line => (line.length ? pad + line : line))
    .join('\n');
}

/** Renders a multi-line string as a `|-` block scalar body, indented. */
function blockScalarBody(value: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return value
    .split('\n')
    .map(line => (line.length ? pad + line : ''))
    .join('\n');
}

/**
 * The chart values, starting at column 0. Follows the `agent` chart's schema:
 * `agent`, `modelConfig` and `skills` are top-level (each forbids extra keys).
 */
function buildAgentValues(model: AgentModel): string {
  const lines: string[] = [];
  lines.push('agent:');
  // Pin the technical (CR) name to the slug so it doesn't depend on Flux's
  // release-name derivation; the chart would otherwise default it.
  lines.push(`  name: ${quote(model.slug)}`);
  lines.push(`  displayName: ${quote(model.name)}`);
  lines.push(`  description: ${quote(model.description)}`);
  lines.push('  systemMessage: |-');
  lines.push(blockScalarBody(model.systemMessage, 4));
  lines.push('modelConfig:');
  lines.push(`  name: ${quote(model.modelConfigName)}`);
  // skills is optional and gitRefs requires ≥1 entry, so the whole block is
  // omitted when no skills are selected.
  if (model.skills.length > 0) {
    lines.push('skills:');
    lines.push('  gitRefs:');
    for (const skill of model.skills) {
      lines.push(`    - url: ${quote(skill.url)}`);
      if (skill.path) {
        lines.push(`      path: ${quote(skill.path)}`);
      }
      if (skill.ref) {
        lines.push(`      ref: ${quote(skill.ref)}`);
      }
      lines.push(`      name: ${quote(skill.name)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildHelmRelease(
  model: AgentModel,
  ctx: DeployContext,
  agentValues: string,
): string {
  // Required by the flux-multi-tenancy admission policy in tenant namespaces.
  const serviceAccountLine = ctx.serviceAccountName
    ? `  serviceAccountName: ${ctx.serviceAccountName}\n`
    : '';
  return `apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: ${model.slug}
  namespace: ${ctx.namespace}
spec:
  interval: 10m
${serviceAccountLine}  chartRef:
    kind: OCIRepository
    name: ${CHART_NAME}
    namespace: ${ctx.namespace}
  values:
${indent(agentValues.trimEnd(), 4)}
`;
}

function buildOCIRepository(ctx: DeployContext): string {
  return `apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: ${CHART_NAME}
  namespace: ${ctx.namespace}
spec:
  interval: 30m
  url: ${ctx.chartOciUrl}
  ref:
    semver: "${CHART_SEMVER_RANGE}"
`;
}

function buildHelmInstall(model: AgentModel, ctx: DeployContext): string {
  return `helm install ${model.slug} \\
  ${ctx.chartOciUrl} \\
  --version ${ctx.chartVersion} \\
  --namespace ${ctx.namespace} \\
  --create-namespace \\
  --values ${model.slug}-values.yaml`;
}

export function composeManifests(
  model: AgentModel,
  ctx: DeployContext,
): ComposedManifests {
  const valuesYaml = buildAgentValues(model);
  const dir = `clusters/${ctx.installation}/${ctx.namespace}`;

  const helmReleaseFile: ComposedFile = {
    path: `${dir}/${model.slug}.yaml`,
    filename: `${model.slug}.yaml`,
    content: buildHelmRelease(model, ctx, valuesYaml),
  };

  const ociRepositoryFile: ComposedFile = {
    path: `${dir}/${CHART_NAME}.yaml`,
    filename: `${CHART_NAME}.yaml`,
    content: buildOCIRepository(ctx),
  };

  // Multi-document YAML for the direct-apply path. OCIRepository first so the
  // chart source exists before the HelmRelease references it (Flux reconciles
  // asynchronously regardless, but this reads cleanly and applies cleanly).
  const combinedManifest = `${[
    ociRepositoryFile.content.trimEnd(),
    helmReleaseFile.content.trimEnd(),
  ].join('\n---\n')}\n`;

  return {
    files: [helmReleaseFile, ociRepositoryFile],
    combinedManifest,
    valuesYaml,
    helmInstallCommand: buildHelmInstall(model, ctx),
  };
}

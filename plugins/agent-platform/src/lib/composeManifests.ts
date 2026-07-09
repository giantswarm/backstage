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
// common self-contained Flux pattern. The `general-purpose-agent` chart does
// not exist yet, so the chart URL/version/values shape are provisional and
// expected to change once the real chart lands.

export type AgentModel = {
  /** Display name (agent.displayName). */
  name: string;
  /** URL-friendly identifier; also the HelmRelease/release name. */
  slug: string;
  description: string;
  /** ModelConfig CR name (agent.modelConfig.name). */
  modelConfigName: string;
  /** ModelConfig CR namespace (agent.modelConfig.namespace). */
  modelConfigNamespace: string;
  /** System message (agent.systemMessage). */
  systemMessage: string;
  /** OCI skill artifact refs (agent.skills.refs). Deferred in v1 → empty. */
  skillRefs: string[];
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
  /** Chart version to pin. */
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

const CHART_NAME = 'general-purpose-agent';

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

/** The `agent:` values block, starting at column 0. */
function buildAgentValues(model: AgentModel): string {
  const lines: string[] = [];
  lines.push('agent:');
  lines.push(`  displayName: ${quote(model.name)}`);
  lines.push(`  description: ${quote(model.description)}`);
  lines.push('  modelConfig:');
  lines.push(`    name: ${quote(model.modelConfigName)}`);
  lines.push(`    namespace: ${quote(model.modelConfigNamespace)}`);
  lines.push('  systemMessage: |-');
  lines.push(blockScalarBody(model.systemMessage, 4));
  lines.push('  skills:');
  if (model.skillRefs.length === 0) {
    lines.push('    refs: []');
  } else {
    lines.push('    refs:');
    for (const ref of model.skillRefs) {
      lines.push(`      - ${quote(ref)}`);
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
    tag: ${ctx.chartVersion}
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

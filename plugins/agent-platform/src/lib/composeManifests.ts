// Composes the GitOps artifacts for a new agent from the create-form model.
//
// The prototype models three files (a standalone values.yaml diffed against
// chart defaults, a HelmRelease referencing a ConfigMap, and an OCIRepository).
// We deviate deliberately: the `general-purpose-agent` chart does not exist yet
// and the prototype's HelmRelease referenced a ConfigMap that was never
// generated. Inlining the agent values into `HelmRelease.spec.values` is the
// common, self-contained Flux pattern and avoids that dangling reference. The
// committed set is therefore two files (HelmRelease + OCIRepository); the
// standalone values block is still produced for the manual `helm install`
// fallback. All of this is expected to change once the real chart lands.

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
  /** Installation / management cluster name (used in the GitOps file path). */
  installation: string;
  /** Namespace the HelmRelease/OCIRepository are placed in. */
  namespace: string;
  /** Chart OCI URL without a tag. */
  chartOciUrl: string;
  /** Chart version to pin. */
  chartVersion: string;
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
  return `apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: ${model.slug}
  namespace: ${ctx.namespace}
spec:
  interval: 10m
  chartRef:
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

  return {
    files: [helmReleaseFile, ociRepositoryFile],
    valuesYaml,
    helmInstallCommand: buildHelmInstall(model, ctx),
  };
}

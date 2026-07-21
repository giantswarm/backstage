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
// `skills` are top-level keys.
//
// Manifests are built as plain objects and serialized with `yaml.dump`, never
// by string concatenation — js-yaml handles quoting, escaping and (critically)
// block-scalar indentation, so arbitrary system prompts can't produce invalid
// YAML.

import { dump } from 'js-yaml';

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
  /**
   * Canonical avatar URL (chart `agent.iconUrl`), derived from the technical
   * name — see agentAvatar. Empty → the field is omitted (chart default).
   */
  iconUrl: string;
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

export const CHART_NAME = 'agent';

// The OCIRepository tracks the chart by semver range rather than a pinned tag,
// so Flux automatically upgrades the agent to the latest published release
// (GS "major upgrades" convention: every position is a wildcard).
const CHART_SEMVER_RANGE = 'x.x.x';

// lineWidth: -1 disables line wrapping so URLs/prompts aren't folded; noRefs
// avoids YAML anchors for repeated values.
const YAML_OPTS = { lineWidth: -1, noRefs: true } as const;

/**
 * The chart values object. Follows the `agent` chart's schema: `agent`,
 * `modelConfig` and `skills` are top-level (each forbids extra keys).
 */
function buildValues(model: AgentModel): Record<string, unknown> {
  const agent: Record<string, unknown> = {
    // Pin the technical (CR) name to the slug so it doesn't depend on Flux's
    // release-name derivation; the chart would otherwise default it.
    name: model.slug,
    displayName: model.name,
  };
  if (model.description.trim()) {
    agent.description = model.description;
  }
  // Deterministic avatar URL for the agent's technical name; omitted when it
  // can't be resolved so the chart keeps its default (empty) rather than us
  // writing an empty string.
  if (model.iconUrl.trim()) {
    agent.iconUrl = model.iconUrl;
  }
  // Only override the prompt when the user provided one; an empty field means
  // "use the chart's default agent.systemMessage" (and the chart requires a
  // non-empty value, so we must not emit an empty one).
  if (model.systemMessage.trim()) {
    agent.systemMessage = model.systemMessage;
  }

  const values: Record<string, unknown> = {
    agent,
    modelConfig: { name: model.modelConfigName },
  };

  // skills is optional and gitRefs requires ≥1 entry, so the whole block is
  // omitted when no skills are selected.
  if (model.skills.length > 0) {
    values.skills = {
      gitRefs: model.skills.map(skill => ({
        url: skill.url,
        ...(skill.path ? { path: skill.path } : {}),
        ...(skill.ref ? { ref: skill.ref } : {}),
        name: skill.name,
      })),
    };
  }

  return values;
}

function buildHelmRelease(
  model: AgentModel,
  ctx: DeployContext,
  values: Record<string, unknown>,
): string {
  const spec: Record<string, unknown> = { interval: '10m' };
  // Required by the flux-multi-tenancy admission policy in tenant namespaces.
  if (ctx.serviceAccountName) {
    spec.serviceAccountName = ctx.serviceAccountName;
  }
  spec.chartRef = {
    kind: 'OCIRepository',
    name: CHART_NAME,
    namespace: ctx.namespace,
  };
  spec.values = values;

  return dump(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: model.slug, namespace: ctx.namespace },
      spec,
    },
    YAML_OPTS,
  );
}

function buildOCIRepository(ctx: DeployContext): string {
  return dump(
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      metadata: { name: CHART_NAME, namespace: ctx.namespace },
      spec: {
        interval: '30m',
        url: ctx.chartOciUrl,
        ref: { semver: CHART_SEMVER_RANGE },
      },
    },
    YAML_OPTS,
  );
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
  const values = buildValues(model);
  const valuesYaml = dump(values, YAML_OPTS);
  const dir = `clusters/${ctx.installation}/${ctx.namespace}`;

  const helmReleaseFile: ComposedFile = {
    path: `${dir}/${model.slug}.yaml`,
    filename: `${model.slug}.yaml`,
    content: buildHelmRelease(model, ctx, values),
  };

  const ociRepositoryFile: ComposedFile = {
    path: `${dir}/${CHART_NAME}.yaml`,
    filename: `${CHART_NAME}.yaml`,
    content: buildOCIRepository(ctx),
  };

  // Multi-document YAML for the direct-apply path. OCIRepository first so the
  // chart source exists before the HelmRelease references it (Flux reconciles
  // asynchronously regardless, but this reads cleanly and applies cleanly).
  // Each dump() output already ends with a newline.
  const combinedManifest = [
    ociRepositoryFile.content,
    helmReleaseFile.content,
  ].join('---\n');

  return {
    files: [helmReleaseFile, ociRepositoryFile],
    combinedManifest,
    valuesYaml,
    helmInstallCommand: buildHelmInstall(model, ctx),
  };
}

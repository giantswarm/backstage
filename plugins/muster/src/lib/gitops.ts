import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * GitOps provenance recovered from a CR's labels/annotations. Both the Helm
 * (`meta.helm.sh/*`) and Flux HelmRelease/Kustomization
 * (`*.toolkit.fluxcd.io/*`) conventions are checked, so a resource deployed by
 * either path shows where it comes from. Works for any muster CR carrying the
 * standard markers (MCPServer, Workflow).
 */
export interface Provenance {
  managedBy?: string;
  helmRelease?: string;
  helmNamespace?: string;
  fluxHelmRelease?: string;
  fluxHelmNamespace?: string;
  fluxKustomization?: string;
  fluxKustomizationNamespace?: string;
}

export function readProvenance(obj: KubeObject): Provenance {
  const labels = obj.getLabels() ?? {};
  const annotations = obj.getAnnotations() ?? {};
  return {
    managedBy: labels['app.kubernetes.io/managed-by'],
    helmRelease: annotations['meta.helm.sh/release-name'],
    helmNamespace: annotations['meta.helm.sh/release-namespace'],
    fluxHelmRelease: labels['helm.toolkit.fluxcd.io/name'],
    fluxHelmNamespace: labels['helm.toolkit.fluxcd.io/namespace'],
    fluxKustomization: labels['kustomize.toolkit.fluxcd.io/name'],
    fluxKustomizationNamespace: labels['kustomize.toolkit.fluxcd.io/namespace'],
  };
}

/**
 * Whether the resource is owned by GitOps (Flux/Helm) and therefore read-only
 * in the app: editing it live via the muster store would be reverted by the
 * reconciler. Ad-hoc resources (created through muster's own store, no
 * Flux/Helm/Helm-managed-by markers) return false and may be mutated live.
 *
 * Provenance is the only UI restriction: GitOps-managed resources produce a
 * PR/manifest to commit; ad-hoc (manually added) resources allow live
 * core_*_create/_update/_delete CRUD. Applies identically to MCPServer and
 * Workflow CRs. See the provenance-only safety model ADR in klaus-lab.
 */
export function isGitOpsManaged(obj: KubeObject): boolean {
  const p = readProvenance(obj);
  return Boolean(
    p.fluxHelmRelease ||
    p.fluxKustomization ||
    p.helmRelease ||
    p.managedBy === 'Helm' ||
    p.managedBy === 'flux',
  );
}

/** The HelmRelease (or Kustomization) that owns the server, `ns/name` form. */
export function provenanceReleaseId(p: Provenance): string | undefined {
  const release = p.helmRelease ?? p.fluxHelmRelease;
  const namespace = p.helmNamespace ?? p.fluxHelmNamespace;
  if (release) {
    return namespace ? `${namespace}/${release}` : release;
  }
  if (p.fluxKustomization) {
    return p.fluxKustomizationNamespace
      ? `${p.fluxKustomizationNamespace}/${p.fluxKustomization}`
      : p.fluxKustomization;
  }
  return undefined;
}

/**
 * Flatten an MCPServer CR's spec into the argument shape muster's
 * `core_mcpserver_create`/`_update`/`_validate` tools take (name + flat spec
 * fields; see internal/mcpserver/api_adapter.go). Used both to seed the ad-hoc
 * edit form and as the body of the validate/save calls.
 */
export function toMcpServerDefinition(
  server: KubeObject,
): Record<string, unknown> {
  const spec = (
    server as unknown as { jsonData: { spec?: Record<string, unknown> } }
  ).jsonData.spec;
  const definition: Record<string, unknown> = { name: server.getName() };
  if (!spec) {
    return definition;
  }
  for (const key of [
    'type',
    'toolPrefix',
    'family',
    'description',
    'autoStart',
    'command',
    'args',
    'url',
    'env',
    'headers',
    'timeout',
    'auth',
  ]) {
    if (spec[key] !== undefined) {
      definition[key] = spec[key];
    }
  }
  return definition;
}

/**
 * Minimal YAML emitter for plain JSON values (string/number/boolean/null,
 * arrays, objects). Sufficient for rendering an MCPServer manifest in the
 * GitOps "manifest to commit" dialog.
 *
 * ponytail: not a general YAML serializer -- no anchors, no multi-doc, naive
 * string quoting. The MCPServer manifest is a small, controlled shape so this
 * is enough; upgrade path is the `yaml` package if richer output is ever needed.
 */
export function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return quoteScalar(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return value
      .map(item => {
        const rendered = toYaml(item, indent + 1);
        if (isComplex(item)) {
          return `${pad}-\n${rendered}`;
        }
        return `${pad}- ${rendered}`;
      })
      .join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) {
      return '{}';
    }
    return entries
      .map(([key, v]) => {
        if (isComplex(v)) {
          return `${pad}${key}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${key}: ${toYaml(v, indent + 1)}`;
      })
      .join('\n');
  }
  return String(value);
}

function isComplex(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value as object).length > 0
  );
}

function quoteScalar(value: string): string {
  // Quote only when needed: empty, leading/trailing space, or YAML-special.
  if (value === '' || /[:#{}\[\],&*!|>'"%@`]|^\s|\s$|^-\s/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Render a muster CR (MCPServer or Workflow) as a k8s manifest YAML for the
 * GitOps PR path. This is the artifact an operator commits to the
 * management-clusters repo; the app never applies it live (GitOps-managed
 * resources are read-only here). The apiVersion/kind come from the object, so
 * the same emitter serves both kinds.
 */
export function toManifestYaml(
  obj: KubeObject,
  defaultNamespace = 'agentic-platform',
): string {
  const spec = (
    obj as unknown as { jsonData: { spec?: Record<string, unknown> } }
  ).jsonData.spec;
  const manifest = {
    apiVersion: obj.getApiVersion() || 'muster.giantswarm.io/v1alpha1',
    kind: obj.getKind() || 'MCPServer',
    metadata: {
      name: obj.getName(),
      namespace: obj.getNamespace() ?? defaultNamespace,
    },
    spec: spec ?? {},
  };
  return toYaml(manifest);
}

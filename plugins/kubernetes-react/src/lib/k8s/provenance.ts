import { KubeObject } from './KubeObject';

const LABEL_KUSTOMIZATION_NAME = 'kustomize.toolkit.fluxcd.io/name';
const LABEL_KUSTOMIZATION_NAMESPACE = 'kustomize.toolkit.fluxcd.io/namespace';
const LABEL_HELMRELEASE_NAME = 'helm.toolkit.fluxcd.io/name';
const LABEL_HELMRELEASE_NAMESPACE = 'helm.toolkit.fluxcd.io/namespace';
const LABEL_MANAGED_BY = 'app.kubernetes.io/managed-by';
const ANNOTATION_HELM_RELEASE_NAME = 'meta.helm.sh/release-name';
const ANNOTATION_HELM_RELEASE_NAMESPACE = 'meta.helm.sh/release-namespace';

/**
 * Name of the Flux `Kustomization` that applied this object, from the labels
 * Flux stamps on everything it applies.
 */
export function getKustomizationName(object: KubeObject) {
  return object.getLabels()?.[LABEL_KUSTOMIZATION_NAME];
}

export function getKustomizationNamespace(object: KubeObject) {
  return object.getLabels()?.[LABEL_KUSTOMIZATION_NAMESPACE];
}

/**
 * Name of the Flux `HelmRelease` whose chart rendered this object. Set by the
 * helm-controller on every object in a release, and the marker our kagent
 * `Agent`s carry — they are rendered by the `agent` chart rather than applied
 * from a Kustomization directly.
 */
export function getHelmReleaseName(object: KubeObject) {
  return object.getLabels()?.[LABEL_HELMRELEASE_NAME];
}

export function getHelmReleaseNamespace(object: KubeObject) {
  return object.getLabels()?.[LABEL_HELMRELEASE_NAMESPACE];
}

/**
 * Whether the object was applied by a Flux `Kustomization`.
 *
 * Deliberately narrower than {@link isGitOpsManaged}: a Kustomization always has
 * a source (a `GitRepository`/`OCIRepository`), so this is the marker that lets a
 * caller resolve the object back to a path in Git. An object rendered by a
 * HelmRelease carries no such link of its own — see {@link getHelmReleaseName}
 * for the extra hop that needs.
 */
export function isManagedByFlux(object: KubeObject) {
  return (
    Boolean(getKustomizationName(object)) &&
    Boolean(getKustomizationNamespace(object))
  );
}

/**
 * GitOps provenance recovered from a CR's labels/annotations. Both the Helm
 * (`meta.helm.sh/*`) and Flux HelmRelease/Kustomization
 * (`*.toolkit.fluxcd.io/*`) conventions are checked, so a resource deployed by
 * either path shows where it comes from. Works for any CR carrying the standard
 * markers (kagent `Agent`, muster `MCPServer`/`Workflow`, an `App`, …).
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
    managedBy: labels[LABEL_MANAGED_BY],
    helmRelease: annotations[ANNOTATION_HELM_RELEASE_NAME],
    helmNamespace: annotations[ANNOTATION_HELM_RELEASE_NAMESPACE],
    fluxHelmRelease: labels[LABEL_HELMRELEASE_NAME],
    fluxHelmNamespace: labels[LABEL_HELMRELEASE_NAMESPACE],
    fluxKustomization: labels[LABEL_KUSTOMIZATION_NAME],
    fluxKustomizationNamespace: labels[LABEL_KUSTOMIZATION_NAMESPACE],
  };
}

/**
 * Whether the resource is owned by GitOps (Flux/Helm) and therefore read-only
 * in the app: editing it live would be reverted by the reconciler. Ad-hoc
 * resources (created directly, no Flux/Helm/Helm-managed-by markers) return
 * false and may be mutated live.
 *
 * Provenance is the only UI restriction: GitOps-managed resources produce a
 * PR/manifest to commit; ad-hoc (manually added) resources allow live CRUD. See
 * the provenance-only safety model ADR in klaus-lab.
 *
 * Note this answers "is a reconciler in charge of this object", *not* "is this
 * object's desired state in Git". A HelmRelease applied by hand (or by our
 * scaffolder) satisfies this while having no Git source at all. Callers that
 * want to link to the source must resolve it and handle the absence — see
 * {@link isManagedByFlux}.
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

/** The HelmRelease (or Kustomization) that owns the object, `ns/name` form. */
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

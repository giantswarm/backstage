import { KubeObject } from './KubeObject';
import {
  getHelmReleaseName,
  getHelmReleaseNamespace,
  getKustomizationName,
  getKustomizationNamespace,
  isGitOpsManaged,
  isManagedByFlux,
  provenanceReleaseId,
  readProvenance,
} from './provenance';

function makeObject(
  metadata: Record<string, unknown> = {},
  cluster = 'gazelle',
): KubeObject {
  return new KubeObject(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agentic-platform',
        ...metadata,
      },
    } as never,
    cluster,
  );
}

describe('provenance', () => {
  describe('isManagedByFlux', () => {
    it('is true only when both Kustomization labels are present', () => {
      const object = makeObject({
        labels: {
          'kustomize.toolkit.fluxcd.io/name': 'agents',
          'kustomize.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
        },
      });

      expect(isManagedByFlux(object)).toBe(true);
      expect(getKustomizationName(object)).toBe('agents');
      expect(getKustomizationNamespace(object)).toBe('flux-giantswarm');
    });

    it('is false when only the name label is present', () => {
      const object = makeObject({
        labels: { 'kustomize.toolkit.fluxcd.io/name': 'agents' },
      });

      expect(isManagedByFlux(object)).toBe(false);
    });

    // The distinction that matters for kagent Agents: they are rendered by a
    // HelmRelease, so they are reconciled but carry no Kustomization link.
    it('is false for an object rendered by a HelmRelease', () => {
      const object = makeObject({
        labels: {
          'helm.toolkit.fluxcd.io/name': 'pr-reviewer',
          'helm.toolkit.fluxcd.io/namespace': 'agentic-platform',
        },
      });

      expect(isManagedByFlux(object)).toBe(false);
      expect(isGitOpsManaged(object)).toBe(true);
    });
  });

  describe('getHelmReleaseName / getHelmReleaseNamespace', () => {
    it('reads the helm-controller labels', () => {
      const object = makeObject({
        labels: {
          'helm.toolkit.fluxcd.io/name': 'pr-reviewer',
          'helm.toolkit.fluxcd.io/namespace': 'agentic-platform',
        },
      });

      expect(getHelmReleaseName(object)).toBe('pr-reviewer');
      expect(getHelmReleaseNamespace(object)).toBe('agentic-platform');
    });

    it('returns undefined when the object carries no Helm labels', () => {
      expect(getHelmReleaseName(makeObject())).toBeUndefined();
      expect(getHelmReleaseNamespace(makeObject())).toBeUndefined();
    });
  });

  describe('isGitOpsManaged', () => {
    it('treats a Flux HelmRelease-labelled object as GitOps-managed', () => {
      expect(
        isGitOpsManaged(
          makeObject({
            labels: { 'helm.toolkit.fluxcd.io/name': 'agentic-platform' },
          }),
        ),
      ).toBe(true);
    });

    it('treats a Kustomization-labelled object as GitOps-managed', () => {
      expect(
        isGitOpsManaged(
          makeObject({
            labels: { 'kustomize.toolkit.fluxcd.io/name': 'agents' },
          }),
        ),
      ).toBe(true);
    });

    it('treats a plain Helm release as GitOps-managed', () => {
      expect(
        isGitOpsManaged(
          makeObject({
            annotations: { 'meta.helm.sh/release-name': 'muster' },
          }),
        ),
      ).toBe(true);
    });

    it('recognises the managed-by label on its own', () => {
      expect(
        isGitOpsManaged(
          makeObject({ labels: { 'app.kubernetes.io/managed-by': 'Helm' } }),
        ),
      ).toBe(true);
      expect(
        isGitOpsManaged(
          makeObject({ labels: { 'app.kubernetes.io/managed-by': 'flux' } }),
        ),
      ).toBe(true);
    });

    it('treats an object with no Flux/Helm markers as ad-hoc (live CRUD)', () => {
      expect(isGitOpsManaged(makeObject())).toBe(false);
      expect(
        isGitOpsManaged(
          makeObject({ labels: { 'app.kubernetes.io/managed-by': 'kubectl' } }),
        ),
      ).toBe(false);
    });
  });

  describe('provenanceReleaseId', () => {
    it('prefers the Helm annotations over the Flux labels', () => {
      const provenance = readProvenance(
        makeObject({
          labels: {
            'helm.toolkit.fluxcd.io/name': 'flux-name',
            'helm.toolkit.fluxcd.io/namespace': 'flux-ns',
          },
          annotations: {
            'meta.helm.sh/release-name': 'helm-name',
            'meta.helm.sh/release-namespace': 'helm-ns',
          },
        }),
      );

      expect(provenanceReleaseId(provenance)).toBe('helm-ns/helm-name');
    });

    it('falls back to the Kustomization when there is no release', () => {
      const provenance = readProvenance(
        makeObject({
          labels: {
            'kustomize.toolkit.fluxcd.io/name': 'agents',
            'kustomize.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
          },
        }),
      );

      expect(provenanceReleaseId(provenance)).toBe('flux-giantswarm/agents');
    });

    it('omits the namespace when only a name is known', () => {
      const provenance = readProvenance(
        makeObject({
          labels: { 'helm.toolkit.fluxcd.io/name': 'pr-reviewer' },
        }),
      );

      expect(provenanceReleaseId(provenance)).toBe('pr-reviewer');
    });

    it('returns undefined for an ad-hoc object', () => {
      expect(provenanceReleaseId(readProvenance(makeObject()))).toBeUndefined();
    });
  });
});

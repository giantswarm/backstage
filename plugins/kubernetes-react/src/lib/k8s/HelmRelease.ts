import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';
import { compareDates } from '../../utils/compareDates';

type HelmReleaseInterface = crds.fluxcd.v2.HelmRelease;

export class HelmRelease extends FluxObject<HelmReleaseInterface> {
  static readonly supportedVersions = ['v2'] as const;
  static readonly group = 'helm.toolkit.fluxcd.io';
  static readonly kind = 'HelmRelease' as const;
  static readonly plural = 'helmreleases';

  getDependsOn() {
    return this.jsonData.spec?.dependsOn;
  }

  getKubeConfig() {
    return this.jsonData.spec?.kubeConfig;
  }

  getLastAppliedRevision() {
    const history = this.jsonData.status?.history;
    if (!history || history.length === 0) {
      return undefined;
    }

    // Sort history by lastDeployed timestamp (most recent first) and get the chart version
    const sortedHistory = history.sort((a, b) =>
      compareDates(b.lastDeployed, a.lastDeployed),
    );

    return sortedHistory[0]?.chartVersion;
  }

  getLastAttemptedRevision() {
    return this.jsonData.status?.lastAttemptedRevision;
  }

  getLastAttemptedReleaseAction() {
    return this.jsonData.status?.lastAttemptedReleaseAction;
  }

  /**
   * The `Remediated` condition, whatever its status.
   *
   * Deliberately not restricted to status `True`: a rollback or uninstall that
   * itself fails is reported as `Remediated` with status `False` and reason
   * `RollbackFailed`/`UninstallFailed`.
   */
  findRemediatedCondition() {
    return this.findStatusCondition('Remediated');
  }

  findStalledCondition() {
    return this.findStatusCondition('Stalled');
  }

  /**
   * The condition explaining *why* the release failed, when the `Ready`
   * condition no longer does.
   *
   * helm-controller summarizes the release into `Ready` by mirroring one of
   * `Released`, `TestSuccess` or `Remediated` into it verbatim — same reason,
   * same message. So a failed upgrade shows its real error in `Ready` only until
   * the failure is remediated: the rollback overwrites `Ready` with "Helm
   * rollback to previous release ... succeeded", which describes the *previous,
   * working* release and says nothing about the failure. The failing `Released`
   * condition keeps the error until the next release attempt, so that is the one
   * to show instead.
   *
   * Substitution requires `Ready` to be uninformative, which is the case when it
   * is a verbatim mirror of `Remediated` or of a `True` `Stalled`, or when it is
   * `Unknown` on a stalled release — helm-controller leaves the "reconciliation
   * in progress" placeholder behind on an object that has stopped retrying, so
   * the last release attempt is still the current state. `Unknown` is safe to
   * override because it never reports a failure; a blocker always writes `False`.
   *
   * Testing for a mirror rather than for an allow-list of remediation reasons is
   * what keeps a *newer, unrelated* blocker visible. If the object fails again
   * after the rollback for a reason that never reaches a release attempt
   * (`ArtifactFailed`, `DependencyNotReady`, a missing `valuesFrom` Secret, a
   * denied release), `Ready` carries that newer message, no longer equals the
   * remediation, and the older — now misleading — upgrade error is not shown.
   * The mirror test also covers remediation flavours a reason list would miss: a
   * failed install is remediated by an uninstall, and the rollback itself can
   * fail.
   *
   * Returns nothing while `Ready` is `True`. A HelmRelease with
   * `spec.test.ignoreFailures` stays ready with `TestSuccess` failing, and a
   * fresh reconcile of a previously failed object can be in flight
   * (`Ready`/`Progressing`, without `Stalled`) with a stale failing `Released`
   * left over from the previous generation.
   */
  findFailureCauseCondition() {
    const readyCondition = this.findReadyCondition();
    if (!readyCondition || readyCondition.status === 'True') {
      return undefined;
    }

    const mirrors = (
      condition: ReturnType<HelmRelease['findStatusCondition']>,
    ) =>
      Boolean(
        condition &&
        condition.reason === readyCondition.reason &&
        condition.message === readyCondition.message,
      );

    const stalledCondition = this.findStalledCondition();
    const isStalled = stalledCondition?.status === 'True';
    const readyIsUninformative =
      mirrors(this.findRemediatedCondition()) ||
      (isStalled && mirrors(stalledCondition)) ||
      (isStalled && readyCondition.status === 'Unknown');

    if (!readyIsUninformative) {
      return undefined;
    }

    // An upgrade that succeeded but whose Helm tests failed leaves `Released`
    // true and `TestSuccess` false, while an upgrade that failed outright can
    // leave a stale failing `TestSuccess` from an earlier cycle behind. The most
    // recent transition is the actual cause in both cases.
    const causes = ['Released', 'TestSuccess']
      .flatMap(type => this.findStatusCondition(type) ?? [])
      .filter(condition => condition.status === 'False')
      .sort((a, b) => compareDates(b.lastTransitionTime, a.lastTransitionTime));

    return causes[0];
  }

  getChart() {
    return this.jsonData.spec?.chart;
  }

  getChartRef():
    | {
        apiVersion?: string;
        kind: 'OCIRepository' | 'HelmChart' | 'ExternalArtifact';
        name: string;
        namespace: string;
      }
    | undefined {
    const ref = this.jsonData.spec?.chartRef;
    if (!ref || !ref.kind || !ref.name) {
      return undefined;
    }
    return {
      apiVersion: ref.apiVersion,
      kind: ref.kind,
      name: ref.name,
      namespace: ref.namespace ?? this.getNamespace() ?? '',
    };
  }

  getChartSourceRef() {
    return this.jsonData.spec?.chart?.spec.sourceRef;
  }

  getReleaseName() {
    return this.jsonData.spec?.releaseName;
  }

  getTargetNamespace() {
    return this.jsonData.spec?.targetNamespace;
  }

  getInterval() {
    return this.jsonData.spec?.interval;
  }

  getTimeout() {
    return this.jsonData.spec?.timeout;
  }

  getInstallFailures() {
    return this.jsonData.status?.installFailures;
  }

  getUpgradeFailures() {
    return this.jsonData.status?.upgradeFailures;
  }

  getValuesFrom() {
    return this.jsonData.spec?.valuesFrom;
  }

  getValues() {
    return this.jsonData.spec?.values;
  }

  hasInlineValues() {
    const values = this.getValues();
    return values !== undefined && Object.keys(values).length > 0;
  }
}

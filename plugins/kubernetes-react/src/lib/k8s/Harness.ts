import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';
import { HARNESS_LABEL } from './Agent';

type HarnessInterface = crds.kagent.v1alpha3.Harness;

/**
 * The runtime adapter a Harness selects: the one of `spec.kagent`,
 * `spec.claude`, `spec.codex` and `spec.byo` that is set.
 */
export type HarnessRuntime = 'kagent' | 'claude' | 'codex' | 'byo';

const RUNTIMES: readonly HarnessRuntime[] = [
  'kagent',
  'claude',
  'codex',
  'byo',
];

/**
 * kagent Harness — a runtime (the Go ADK, Claude Code, Codex or a custom
 * image) and its infrastructure policy. An AgentTemplate runs on the Harness
 * whose `allowedAgentTemplates` selector matches it.
 */
export class Harness extends KubeObject<HarnessInterface> {
  static readonly supportedVersions = ['v1alpha3'] as const;
  static readonly group = 'kagent.dev';
  static readonly kind = 'Harness' as const;
  static readonly plural = 'harnesses';

  /** The runtime adapter, `undefined` when the spec sets none this client knows. */
  getRuntime(): HarnessRuntime | undefined {
    const spec = this.jsonData.spec;
    return RUNTIMES.find(runtime => spec?.[runtime] !== undefined);
  }

  /**
   * The value of {@link HARNESS_LABEL} this Harness admits templates by: what
   * agent-manager's `harness` argument names. `undefined` when its selector
   * does not match on that label, so no agent the Generic chart renders can be
   * admitted by it.
   */
  getAdmittedHarnessLabel(): string | undefined {
    const value =
      this.jsonData.spec?.allowedAgentTemplates?.selector?.matchLabels?.[
        HARNESS_LABEL
      ];
    return value?.trim() ? value : undefined;
  }

  /**
   * The `ui.giantswarm.io/display-name` annotation, or `undefined` when it is
   * missing or blank.
   */
  getDisplayNameAnnotation(): string | undefined {
    const value = this.getAnnotations()?.['ui.giantswarm.io/display-name'];
    return value?.trim() ? value : undefined;
  }

  /** The workload image reference, digest included. */
  getImage(): string | undefined {
    return this.jsonData.spec?.workload.image;
  }
}

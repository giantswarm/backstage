import { KubeObject } from './KubeObject';
import {
  KAGENT_API_GROUP,
  type ClaudeHarnessLimits,
  type HarnessInterface,
} from './kagentApi';

export type { ClaudeHarnessLimits, HarnessInterface } from './kagentApi';

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
 * image) and its infrastructure policy. An Agent runs on the Harness its
 * `spec.harnessRef` names; any Harness of the namespace is a valid choice.
 */
export class Harness extends KubeObject<HarnessInterface> {
  static readonly supportedVersions = ['v1alpha3'] as const;
  static readonly group = KAGENT_API_GROUP;
  static readonly kind = 'Harness' as const;
  static readonly plural = 'harnesses';

  /** The runtime adapter, `undefined` when the spec sets none this client knows. */
  getRuntime(): HarnessRuntime | undefined {
    const spec = this.jsonData.spec;
    return RUNTIMES.find(runtime => spec?.[runtime] !== undefined);
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

  /** The per-turn bounds a Claude Code Harness enforces on every agent, when set. */
  getLimits(): ClaudeHarnessLimits | undefined {
    return this.jsonData.spec?.claude?.limits;
  }

  /** The hosts every agent on the Harness may reach besides what its revision compiles. */
  getEgress(): string[] {
    return [...(this.jsonData.spec?.substrate.egress ?? [])];
  }
}

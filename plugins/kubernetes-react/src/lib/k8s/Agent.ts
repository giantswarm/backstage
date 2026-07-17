import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type AgentInterface = crds.kagent.v1alpha2.Agent;

/**
 * kagent Agent — a reusable agent definition, deployed via the
 * `general-purpose-agent` Helm chart. The capability surface (model, system
 * prompt, skills) lives under `spec.declarative` for declarative agents.
 */
export class Agent extends KubeObject<AgentInterface> {
  static readonly supportedVersions = ['v1alpha2'] as const;
  static readonly group = 'kagent.dev';
  static readonly kind = 'Agent' as const;
  static readonly plural = 'agents';

  /**
   * Friendly name for lists. Prefers the `ui.giantswarm.io/display-name`
   * annotation when present, otherwise falls back to the resource name. Mirrors
   * `ModelConfig.getDisplayName()`.
   */
  getDisplayName() {
    return (
      this.getAnnotations()?.['ui.giantswarm.io/display-name'] ?? this.getName()
    );
  }

  /** `Declarative` (chart-configured) or `BYO` (bring-your-own container). */
  getType() {
    return this.jsonData.spec?.type;
  }

  getDescription() {
    return this.jsonData.spec?.description;
  }

  /** Name of the referenced ModelConfig (declarative agents only). */
  getModelConfigName() {
    return this.jsonData.spec?.declarative?.modelConfig;
  }

  getSystemMessage() {
    return this.jsonData.spec?.declarative?.systemMessage;
  }

  /**
   * Git repositories the agent pulls skills from, each mounted under `/skills`.
   * (The v1alpha2 CRD models skills as `spec.skills.gitRefs`.)
   */
  getSkillRefs() {
    return this.jsonData.spec?.skills?.gitRefs ?? [];
  }

  /** Number of skills mounted by the agent. */
  getSkillCount() {
    return this.getSkillRefs().length;
  }
}

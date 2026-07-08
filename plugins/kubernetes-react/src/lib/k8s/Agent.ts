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

  /** OCI/git skill image refs mounted under /skills. */
  getSkillRefs() {
    return this.jsonData.spec?.skills?.refs ?? [];
  }
}

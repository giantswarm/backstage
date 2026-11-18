import type { AgentManagerModelConfig } from '../../lib/agentManager';

/** The part of a ModelConfig the picker shows and picks by. */
export type ModelChoice = {
  getName(): string;
  getNamespace(): string | undefined;
  getDisplayName(): string;
  getModel(): string | undefined;
  getProvider(): string | undefined;
};

/** The models a new agent in `tenant` may run on; every model without one. */
export function tenantModelConfigs<T extends ModelChoice>(
  modelConfigs: readonly T[],
  tenant: string | undefined,
): T[] {
  if (!tenant) {
    return [...modelConfigs];
  }
  return modelConfigs.filter(mc => (mc.getNamespace() ?? '') === tenant);
}

/**
 * The model the create form starts with: the namespace default agent-manager
 * reports (`default: true`), when it is among the choices. Without one the
 * person picks.
 */
export function preselectedModelConfig<T extends ModelChoice>(
  modelConfigs: readonly T[],
  reported: readonly AgentManagerModelConfig[],
): T | undefined {
  const marked = reported.find(mc => mc.default === true);
  if (!marked) {
    return undefined;
  }
  return modelConfigs.find(
    mc =>
      mc.getName() === marked.name &&
      (mc.getNamespace() ?? '') === marked.namespace,
  );
}

/** Whether agent-manager reports `modelConfig` as its namespace's default. */
export function isReportedDefault(
  modelConfig: ModelChoice,
  reported: readonly AgentManagerModelConfig[],
): boolean {
  return reported.some(
    mc =>
      mc.default === true &&
      mc.name === modelConfig.getName() &&
      mc.namespace === (modelConfig.getNamespace() ?? ''),
  );
}

/**
 * Why agents on `modelConfig` may not run, or undefined when nothing says so:
 * agent-manager's `ResolvedRefs` condition when it reported the model (its key
 * Secret missing, say), else the controller's verdict on the object.
 */
export function unresolvedReason(
  modelConfig: ModelChoice & {
    getReadiness?: () => string;
    getReadinessMessage?: () => string | undefined;
  },
  reported: readonly AgentManagerModelConfig[],
): { message?: string } | undefined {
  const fromAgentManager = reported.find(
    mc =>
      mc.name === modelConfig.getName() &&
      mc.namespace === (modelConfig.getNamespace() ?? ''),
  );
  if (fromAgentManager && fromAgentManager.resolvedRefs !== undefined) {
    return fromAgentManager.resolvedRefs === false
      ? {
          message:
            modelConfig.getReadinessMessage?.() ?? fromAgentManager.message,
        }
      : undefined;
  }
  if (modelConfig.getReadiness?.() === 'notAccepted') {
    return { message: modelConfig.getReadinessMessage?.() };
  }
  return undefined;
}

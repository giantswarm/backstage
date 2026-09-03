import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type ModelConfigInterface = crds.kagent.v1alpha2.ModelConfig;

/** A `status.conditions` entry as the kagent controller writes it. */
type ModelConfigCondition = NonNullable<
  NonNullable<ModelConfigInterface['status']>['conditions']
>[number];

/**
 * Condition types the kagent controller sets on a ModelConfig. `Accepted`
 * reports whether the provider/model/secret combination reconciled into
 * something the runtime can mount — there is no separate `Ready`, since a
 * ModelConfig has no workload of its own.
 */
export const ModelConfigConditionType = {
  Accepted: 'Accepted',
} as const;

/**
 * Readiness of a ModelConfig, derived from its status conditions.
 *
 * - `accepted` — the controller resolved the spec (including the referenced
 *   key secret).
 * - `notAccepted` — the controller rejected it, e.g. a missing secret.
 * - `pending` — not reconciled yet, or reconciled against an older generation.
 *   Distinct from `notAccepted`: it means "not known yet", not "broken".
 */
export type ModelConfigReadiness = 'accepted' | 'notAccepted' | 'pending';

function findCondition(
  json: ModelConfigInterface,
  type: string,
): ModelConfigCondition | undefined {
  return json.status?.conditions?.find(condition => condition.type === type);
}

/**
 * Derive a ModelConfig's readiness from its raw status conditions. Exported as
 * a free function (not only a method) for callers holding raw list data.
 *
 * Staleness is only claimed when `status.observedGeneration` is present and
 * behind — absent means "cannot tell", same reasoning as
 * {@link isAgentStatusStale} in `Agent.ts`.
 */
export function deriveModelConfigReadiness(
  json: ModelConfigInterface,
): ModelConfigReadiness {
  const conditions = json.status?.conditions;

  // The controller has not written a status at all yet.
  if (!conditions?.length) {
    return 'pending';
  }

  const { generation } = json.metadata ?? {};
  const observedGeneration = json.status?.observedGeneration;
  if (
    typeof generation === 'number' &&
    typeof observedGeneration === 'number' &&
    observedGeneration < generation
  ) {
    return 'pending';
  }

  return findCondition(json, ModelConfigConditionType.Accepted)?.status ===
    'True'
    ? 'accepted'
    : 'notAccepted';
}

/**
 * kagent ModelConfig — a platform-admin-provisioned reference to a model, its
 * provider and (via a Secret) its credential. Agents pick one by name; the
 * Agent Platform section's Models tab lists and manages them.
 */
export class ModelConfig extends KubeObject<ModelConfigInterface> {
  static readonly supportedVersions = ['v1alpha2'] as const;
  static readonly group = 'kagent.dev';
  static readonly kind = 'ModelConfig' as const;
  static readonly plural = 'modelconfigs';

  /**
   * Friendly name for pickers. Prefers the `ui.giantswarm.io/display-name`
   * annotation when present, otherwise falls back to the resource name.
   */
  getDisplayName() {
    return (
      this.getAnnotations()?.['ui.giantswarm.io/display-name'] ?? this.getName()
    );
  }

  getModel() {
    return this.jsonData.spec?.model;
  }

  getProvider() {
    return this.jsonData.spec?.provider;
  }

  /** Name of the Secret holding the provider API key, if one is referenced. */
  getApiKeySecret() {
    return this.jsonData.spec?.apiKeySecret;
  }

  /** Key inside {@link getApiKeySecret} — the provider's canonical env var. */
  getApiKeySecretKey() {
    return this.jsonData.spec?.apiKeySecretKey;
  }

  getOpenAI() {
    return this.jsonData.spec?.openAI;
  }

  getAnthropic() {
    return this.jsonData.spec?.anthropic;
  }

  getOllama() {
    return this.jsonData.spec?.ollama;
  }

  getTls() {
    return this.jsonData.spec?.tls;
  }

  /**
   * The endpoint this config points at, for display: the provider-specific
   * base URL/host when one is set, `undefined` when the config relies on the
   * provider's default endpoint.
   */
  getEndpoint(): string | undefined {
    const spec = this.jsonData.spec;
    return (
      spec?.openAI?.baseUrl ??
      spec?.anthropic?.baseUrl ??
      spec?.ollama?.host ??
      spec?.azureOpenAI?.azureEndpoint ??
      spec?.sapAICore?.baseUrl
    );
  }

  getReadiness(): ModelConfigReadiness {
    return deriveModelConfigReadiness(this.jsonData);
  }

  /**
   * The controller's `Accepted` condition, for surfacing its `message` (e.g.
   * which Secret could not be found) next to a `notAccepted` readiness.
   */
  getAcceptedCondition() {
    return findCondition(this.jsonData, ModelConfigConditionType.Accepted);
  }
}

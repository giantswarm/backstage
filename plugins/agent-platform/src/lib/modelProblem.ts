import {
  ModelConfig,
  ModelConfigConditionType,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Who can fix a model, for the remedy a problem names: the person, with Edit;
 * the tool that owns it; or, failing both, the platform team.
 */
export type ModelFixer = {
  /** Whether the person can change the model here, with Edit. */
  canEdit: boolean;
  /** The tool that asserts the model (`modelConfigOwner`), if any. */
  owner?: string;
};

/** A model's problem in plain words, for the alert on its page. */
export type ModelProblem = {
  status: 'danger' | 'info';
  title: string;
  /** What is wrong, then what to do about it. */
  description: string;
};

/** Whom to ask to do `what` (a verb phrase, "add the key"). */
function ask(fixer: ModelFixer, what: string): string {
  return fixer.owner
    ? `Ask whoever maintains it in ${fixer.owner} to ${what}.`
    : `Ask your platform team to ${what}.`;
}

/** What to do: the edit the person can make, else whom to ask. */
function remedy(fixer: ModelFixer, edit: string, what: string): string {
  return fixer.canEdit ? edit : ask(fixer, what);
}

/**
 * What is wrong, by the reason kagent gives (kagent's `ResolveModelConfig`):
 * the references it cannot find under `ResolvedRefs`, the settings it
 * rejects under `Accepted`.
 */
function failure(
  type: string,
  reason: string,
  fixer: ModelFixer,
): { problem: string; fix: string } {
  const keyFix = remedy(fixer, 'Enter the key again with Edit.', 'add the key');
  switch (reason) {
    case 'APIKeySecretNotFound':
    case 'SecretNotFound': // Older kagent releases.
      return { problem: 'The API key it needs cannot be found.', fix: keyFix };
    case 'APIKeySecretKeyNotFound':
    case 'BedrockCredentialKeyNotFound':
    case 'SAPAICoreCredentialKeyNotFound':
      return { problem: 'Its stored API key is incomplete.', fix: keyFix };
    case 'EndpointConfigMapNotFound':
    case 'EndpointConfigMapKeyNotFound':
    case 'EndpointConfigMapKeyEmpty':
      // The form sets no endpoint from a ConfigMap: not an edit here.
      return {
        problem: 'The address of its endpoint cannot be found.',
        fix: ask(fixer, 'set the endpoint address'),
      };
    case 'InvalidProviderConfig':
      return {
        problem: 'Its settings are incomplete for its provider.',
        fix: remedy(
          fixer,
          'Complete them with Edit.',
          'complete its provider settings',
        ),
      };
    case 'UnsupportedProvider':
      return {
        problem: 'kagent does not support its provider.',
        fix: remedy(
          fixer,
          'Choose a supported provider with Edit.',
          'move it to a supported provider',
        ),
      };
    default:
  }
  if (type === ModelConfigConditionType.ResolvedRefs) {
    return {
      problem: 'Something it needs, such as its API key, cannot be found.',
      fix: remedy(fixer, 'Check its settings with Edit.', 'check its setup'),
    };
  }
  if (type === ModelConfigConditionType.Accepted) {
    return {
      problem: 'kagent rejected its settings.',
      fix: remedy(fixer, 'Check its settings with Edit.', 'check its setup'),
    };
  }
  return {
    problem: 'kagent reports a problem with it.',
    fix: remedy(fixer, 'Check its settings with Edit.', 'check its setup'),
  };
}

/**
 * Why agents cannot use the model yet, in plain words: what is wrong and what
 * to do, from the condition that failed rather than always `Accepted`, since
 * kagent may accept a model's settings and still not find its key. Reasons,
 * condition names and the controller's own messages stay in Technical
 * details. `undefined` for a model kagent accepted.
 */
export function modelProblem(
  modelConfig: ModelConfig,
  fixer: ModelFixer,
): ModelProblem | undefined {
  const readiness = modelConfig.getReadiness();
  if (readiness === 'accepted') {
    return undefined;
  }
  const failed = modelConfig.getFailedCondition();
  if (readiness === 'notAccepted' && failed) {
    const { problem, fix } = failure(failed.type, failed.reason, fixer);
    return {
      status: 'danger',
      title: 'Agents cannot use this model',
      description: `${problem} ${fix}`,
    };
  }
  return {
    status: 'info',
    title: modelConfig.isStale()
      ? 'kagent has not checked the latest change yet'
      : 'kagent has not checked this model yet',
    description:
      'Agents may not be able to use it until then. Check back in a moment.',
  };
}

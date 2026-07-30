import {
  FluxObject,
  FluxResourceStatus,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildExplainErrorMessage } from '@giantswarm/backstage-plugin-ai-chat-react';

/**
 * The condition to quote to the AI, and the revision it applies to.
 *
 * For a HelmRelease the `Ready` condition can describe the rollback that
 * remediated a failure, or a progress placeholder left behind on a stalled
 * release, rather than the failure itself (see
 * `HelmRelease.findFailureCauseCondition`) — asking the AI to explain "Helm
 * rollback … succeeded" is useless, so the failing release condition wins. It
 * also wins independently of the `Ready` status, since a stalled release keeps
 * `Ready` at `Unknown`.
 */
function getFailureContext(
  resource: FluxObject,
  readyStatus: FluxResourceStatus['readyStatus'],
) {
  if (resource instanceof HelmRelease) {
    const cause = resource.findFailureCauseCondition();
    if (cause?.message) {
      return {
        message: cause.message,
        reason: cause.reason,
        revision: resource.getLastAttemptedRevision(),
      };
    }
  }

  if (readyStatus !== 'False') {
    return undefined;
  }

  const readyCondition = resource.findReadyCondition();

  return readyCondition?.message
    ? { message: readyCondition.message, reason: readyCondition.reason }
    : undefined;
}

type BuildResourceAiChatPromptOptions = {
  kind: string;
  name: string;
  namespace?: string;
  cluster: string;
  resource?: FluxObject;
  readyStatus: FluxResourceStatus['readyStatus'];
};

/**
 * The prompt the resource card's AI chat button sends, and whether it is a
 * troubleshooting one — an explanation request for a failure, a "why is this not
 * ready" question, or an open-ended "show me this resource".
 */
export function buildResourceAiChatPrompt({
  kind,
  name,
  namespace,
  cluster,
  resource,
  readyStatus,
}: BuildResourceAiChatPromptOptions): {
  message: string;
  troubleshoot: boolean;
} {
  const namespacePart = namespace ? ` in namespace '${namespace}'` : '';
  const failure = resource
    ? getFailureContext(resource, readyStatus)
    : undefined;

  if (failure) {
    return {
      message: buildExplainErrorMessage({
        kind,
        name,
        namespace,
        cluster,
        ...failure,
      }),
      troubleshoot: true,
    };
  }

  if (readyStatus === 'False') {
    return {
      message: `Please read the ${kind} resource named '${name}'${namespacePart} on management cluster '${cluster}' and help me understand why it is not in a Ready state.`,
      troubleshoot: true,
    };
  }

  return {
    message: `Please read the ${kind} resource named '${name}'${namespacePart} on management cluster '${cluster}', and show me basic details, so that I can ask further questions about it.`,
    troubleshoot: false,
  };
}

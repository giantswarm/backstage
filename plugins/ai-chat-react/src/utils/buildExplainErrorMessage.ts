const MAX_ERROR_MESSAGE_LENGTH = 4000;

export type ExplainErrorContext = {
  /** Resource kind, e.g. 'Kustomization' or 'HelmRelease'. */
  kind: string;
  name: string;
  namespace?: string;
  /** Management cluster / installation name. */
  cluster: string;
  /** The error message, e.g. from the resource's Ready condition. */
  message: string;
  /** Condition reason, e.g. 'BuildFailed'. */
  reason?: string;
  /** Source revision the failure was reported at. */
  revision?: string;
};

/**
 * Builds an AI chat prompt asking for a plain-language explanation of a
 * resource's error message and suggested next steps.
 */
export function buildExplainErrorMessage(context: ExplainErrorContext): string {
  const { kind, name, namespace, cluster, reason, revision } = context;

  const message =
    context.message.length > MAX_ERROR_MESSAGE_LENGTH
      ? `${context.message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
      : context.message;

  const namespacePart = namespace ? ` in namespace '${namespace}'` : '';
  const revisionPart = revision ? ` at revision '${revision}'` : '';
  const reasonPart = reason ? ` with reason '${reason}'` : '';

  return `The ${kind} resource named '${name}'${namespacePart} on management cluster '${cluster}' is failing${revisionPart}${reasonPart} and reports this error message:

\`\`\`
${message}
\`\`\`

Please explain in plain language what this error means, what the most likely root cause is, and suggest concrete next steps to fix it. You can read the resource and related resources on the cluster if you need more detail.`;
}

import { APICallError, RetryError, StreamProviderError } from 'ai';

const GENERIC_MESSAGE =
  'Something went wrong while generating the reply. Please try again.';

type ProviderError = APICallError | StreamProviderError;

function asProviderError(error: unknown): ProviderError | undefined {
  if (APICallError.isInstance(error) || StreamProviderError.isInstance(error)) {
    return error;
  }
  return undefined;
}

// Provider messages are short strings like "Overloaded" or "Rate limit
// exceeded"; anything long or multi-line is a raw body we'd rather not show.
function providerDetail(error: ProviderError): string | undefined {
  const message = error.message?.trim();
  if (!message || message.length > 200 || message.includes('\n')) {
    return undefined;
  }
  return message.replace(/\.$/, '');
}

/**
 * Turns an error raised while streaming a chat reply into the message the
 * user sees in the conversation. The AI SDK masks every error as
 * "An error occurred." unless the stream is given such a function.
 *
 * Errors reported by the model provider (overloaded, rate limited, …) are
 * shown with the provider's own wording and whether the request was already
 * retried; anything else gets a generic message, since internal error text
 * is neither useful to the user nor safe to expose.
 */
export function describeChatError(error: unknown): string {
  const retried = RetryError.isInstance(error);
  const providerError = asProviderError(retried ? error.lastError : error);
  if (!providerError) {
    return GENERIC_MESSAGE;
  }

  const detail = providerDetail(providerError);
  const parts = [
    detail
      ? `The model provider reports an error: ${detail}.`
      : 'The model provider reports an error.',
  ];
  if (retried && error.errors.length > 1) {
    parts.push(`The request was already tried ${error.errors.length} times.`);
  }
  parts.push(
    providerError.isRetryable
      ? 'Please try again in a moment.'
      : 'Please try again.',
  );
  return parts.join(' ');
}

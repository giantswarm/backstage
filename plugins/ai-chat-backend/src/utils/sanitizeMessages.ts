import { ModelMessage } from 'ai';

interface SanitizeResult {
  messages: ModelMessage[];
  hadUnsupportedContent: boolean;
}

/**
 * Removes file and image parts from user messages, since the AI chat
 * does not support processing images or files (the AI SDK rejects
 * data: URIs during streaming).
 *
 * When a user message consists entirely of unsupported parts, it is
 * replaced with a text placeholder instructing the model to inform
 * the user.
 */
export function sanitizeMessages(messages: ModelMessage[]): SanitizeResult {
  let hadUnsupportedContent = false;

  const sanitized = messages.map(message => {
    if (message.role !== 'user') return message;
    if (typeof message.content === 'string') return message;

    const filtered = message.content.filter(part => {
      if (part.type === 'file' || part.type === 'image') {
        hadUnsupportedContent = true;
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      return {
        ...message,
        content: [
          {
            type: 'text' as const,
            text: '[The user sent an image or file, but this chat does not support image or file inputs. Please let the user know.]',
          },
        ],
      };
    }

    return { ...message, content: filtered };
  });

  return { messages: sanitized, hadUnsupportedContent };
}

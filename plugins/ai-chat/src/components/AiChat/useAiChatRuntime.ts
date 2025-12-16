import { useMemo } from 'react';
import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from '@assistant-ui/react';
import {
  useApi,
  configApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function useAiChatRuntime() {
  const configApi = useApi(configApiRef);
  const identityApi = useApi(identityApiRef);

  const backendUrl = configApi.getString('backend.baseUrl');
  const chatEndpoint = `${backendUrl}/api/ai-chat/chat`;

  const adapter: ChatModelAdapter = useMemo(
    () => ({
      async *run({ messages, abortSignal }) {
        // Get auth token
        const { token } = await identityApi.getCredentials();

        // Convert messages to API format
        const apiMessages: ChatMessage[] = messages.map(
          (msg: ThreadMessage) => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content:
              msg.content
                .filter(part => part.type === 'text')
                .map(part => (part as { type: 'text'; text: string }).text)
                .join('\n') || '',
          }),
        );

        const response = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage: string;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorText;
          } catch {
            errorMessage = errorText;
          }
          throw new Error(`Chat request failed: ${errorMessage}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullText = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Parse the data stream protocol
            // Format: "0:text" for text chunks, "e:error" for errors, etc.
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
              // Handle text chunks (format: 0:"text content")
              if (line.startsWith('0:')) {
                const textContent = line.slice(2);
                try {
                  // The content is JSON encoded
                  const parsed = JSON.parse(textContent);
                  fullText += parsed;
                  yield {
                    content: [{ type: 'text' as const, text: fullText }],
                  };
                } catch {
                  // If not JSON, use as-is
                  fullText += textContent;
                  yield {
                    content: [{ type: 'text' as const, text: fullText }],
                  };
                }
              }
              // Handle error chunks (format: 3:"error message")
              else if (line.startsWith('3:')) {
                const errorContent = line.slice(2);
                try {
                  const errorMessage = JSON.parse(errorContent);
                  throw new Error(errorMessage);
                } catch (e) {
                  if (e instanceof Error && e.message !== errorContent) {
                    throw e;
                  }
                  throw new Error(errorContent);
                }
              }
              // Handle finish messages (format: d:{...}) or other control messages
              else if (line.startsWith('d:') || line.startsWith('e:')) {
                // These are metadata/finish signals, we can ignore them
                continue;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      },
    }),
    [chatEndpoint, identityApi],
  );

  return useLocalRuntime(adapter);
}

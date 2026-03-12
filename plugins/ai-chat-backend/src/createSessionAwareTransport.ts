import { LoggerService } from '@backstage/backend-plugin-api';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export function createSessionAwareTransport(options: {
  url: string;
  headers?: Record<string, string>;
  sessionHeader: string;
  logger: LoggerService;
}): StreamableHTTPClientTransport {
  let capturedSessionId: string | undefined;

  const sessionAwareFetch = async (
    url: string | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (capturedSessionId) {
      headers.set(options.sessionHeader, capturedSessionId);
    }

    const response = await fetch(url, { ...init, headers });

    const sessionId = response.headers.get(options.sessionHeader);
    if (sessionId && sessionId !== capturedSessionId) {
      options.logger.debug(
        `New ${options.sessionHeader} session started: ${sessionId}`,
      );
      capturedSessionId = sessionId;
    }

    return response;
  };

  return new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: {
      headers: options.headers ?? {},
    },
    fetch: sessionAwareFetch,
  });
}

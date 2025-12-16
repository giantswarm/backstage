import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage } from 'ai';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';

export interface RouterOptions {
  httpAuth: HttpAuthService;
  logger: LoggerService;
  config: Config;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { httpAuth, logger, config } = options;

  const router = Router();
  router.use(express.json());

  // Get OpenAI configuration
  const openaiApiKey = config.getOptionalString('aiChat.openai.apiKey');
  const openaiBaseUrl = config.getOptionalString('aiChat.openai.baseUrl');
  const modelName = config.getOptionalString('aiChat.model') ?? 'gpt-4o-mini';

  if (!openaiApiKey) {
    logger.warn(
      'No OpenAI API key configured. Set aiChat.openai.apiKey in app-config.yaml',
    );
  }

  const openai = createOpenAI({
    apiKey: openaiApiKey,
    baseURL: openaiBaseUrl,
  });

  // Schema for chat request
  const chatRequestSchema = z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.union([
          z.string(),
          z.array(
            z.union([
              z.object({ type: z.literal('text'), text: z.string() }),
              z.object({
                type: z.literal('image'),
                image: z.string(),
                mimeType: z.string().optional(),
              }),
            ]),
          ),
        ]),
      }),
    ),
    system: z.string().optional(),
  });

  router.post('/chat', async (req, res) => {
    // Verify user is authenticated
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const userRef = credentials.principal.userEntityRef;

    logger.info(`Chat request from user: ${userRef}`);

    if (!openaiApiKey) {
      throw new InputError(
        'OpenAI API key not configured. Set aiChat.openai.apiKey in app-config.yaml',
      );
    }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(`Invalid request body: ${parsed.error.message}`);
    }

    const { messages, system } = parsed.data;

    try {
      const result = streamText({
        model: openai(modelName),
        messages: messages as UIMessage[],
        system:
          system ??
          'You are a helpful assistant integrated into Backstage, a developer portal. Help users with their questions about their software catalog, services, and development workflows.',
        abortSignal: req.socket ? undefined : undefined,
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Stream the response using the data stream protocol
      const response = result.toDataStreamResponse();

      // Forward the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new InputError('Failed to get response stream');
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }

      res.end();
    } catch (error) {
      logger.error('Error in chat endpoint', error as Error);
      throw error;
    }
  });

  // Health check endpoint
  router.get('/health', (_, res) => {
    res.json({
      status: 'ok',
      configured: !!openaiApiKey,
      model: modelName,
    });
  });

  return router;
}

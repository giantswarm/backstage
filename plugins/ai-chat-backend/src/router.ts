import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
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
    messages: z.array(z.any()),
    tools: z.record(z.string(), z.any()).optional(),
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

    const { messages } = parsed.data;

    try {
      const result = streamText({
        model: openai(modelName),
        messages: convertToModelMessages(messages as UIMessage[]),
        system:
          'You are a helpful assistant integrated into Backstage, a developer portal. Help users with their questions about their software catalog, services, and development workflows.',
        abortSignal: req.socket ? undefined : undefined,
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      result.pipeUIMessageStreamToResponse(res);
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

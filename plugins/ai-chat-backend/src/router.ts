import { frontendTools } from '@assistant-ui/react-ai-sdk';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { extractKubernetesAuthTokens } from './extractKubernetesAuthTokens';
import { getKubernetesMcpTools } from './getKubernetesMcpTools';
import { getMcpTools } from './getMcpTools';

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
    tools: z.any().optional(),
  });

  const defaultSystemPrompt = `
  You are a helpful assistant integrated into Backstage, a developer portal, provided by Giant Swarm.
  You are an expert in Kubernetes, Flux CD, Helm and cloud-native technologies. However, you elegantly adapt to the skill level of the user, who may or may not be an expert in any of these topics.

  The Backstage developer portal provides the following capabilities:

  - Clusters: the user can inspect existing Kubernetes clusters
  - Deployments: the user can inspect existing application deployments (based on Giant Swarm App or Flux HelmRelease resources)
  - Flux: the user can get an overview of Flux sources like GitRepositories and deployment resources like HelmReleases and Kustomizations, and inspect their state
  - Catalog: here the user can find applications running in management and workload clusters, and applications available for deployment
  - Docs: Access to documentation about components in the Catalog

  More information about the Backstage developer portal can be found in the documentation: https://docs.giantswarm.io/overview/developer-portal/

  Your task is to help the user with their questions about their clusters, application deployments, software catalog, and documentation.

  When you asked to access resources from Kubernetes, use kubernetesAuth tool to authenticate first. Then use the appropriate MCP tool to access the resources.
  `;

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

    const { messages, tools } = parsed.data;

    const mcpTools = await getMcpTools(config);
    console.log('==================MCP TOOLS====================');
    console.log(mcpTools);
    console.log('===============================================');

    const kubernetesAuthTokens = extractKubernetesAuthTokens(messages);
    const kubernetesMcpTools = await getKubernetesMcpTools(
      kubernetesAuthTokens,
      config,
    );

    console.log('==================KUBERNETES MCP TOOLS====================');
    console.log(kubernetesMcpTools);
    console.log('===============================================');

    try {
      const result = streamText({
        model: openai(modelName),
        messages: convertToModelMessages(messages as UIMessage[]),
        system: defaultSystemPrompt,
        abortSignal: req.socket ? undefined : undefined,
        tools: {
          ...frontendTools(tools),
          ...mcpTools,
          ...kubernetesMcpTools,
        },
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

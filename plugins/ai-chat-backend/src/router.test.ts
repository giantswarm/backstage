import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mockServices } from '@backstage/backend-test-utils';
import type { JsonObject } from '@backstage/types';
import express from 'express';
import request from 'supertest';
import type { ConversationStore } from './services/ConversationStore';
import { createRouter } from './router';

async function createTestRouter(configData: JsonObject) {
  const logger = mockServices.logger.mock();
  const config = mockServices.rootConfig({ data: configData });
  const router = await createRouter({
    auth: mockServices.auth(),
    httpAuth: mockServices.httpAuth(),
    logger,
    config,
    conversationStore: {} as ConversationStore,
  });
  return { router, logger };
}

async function buildRouter(configData: JsonObject) {
  const { logger } = await createTestRouter(configData);
  return logger;
}

async function getHealth(configData: JsonObject) {
  const { router } = await createTestRouter(configData);
  const response = await request(express().use(router)).get('/health');
  return response.body;
}

function messagesFor(mock: jest.Mock): string[] {
  return mock.mock.calls.map(call => String(call[0]));
}

/**
 * A mounted service-account JSON, as the Helm chart provides it. The router
 * treats Vertex as configured only when the file actually exists.
 */
function withMountedServiceAccount(
  run: (keyFilename: string) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gvertex-'));
    try {
      const keyFilename = join(dir, 'credentials.json');
      writeFileSync(keyFilename, '{"type":"service_account"}');
      await run(keyFilename);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

describe('createRouter provider configuration logging', () => {
  it('logs the missing OpenAI key at info (not warn) so it is not forwarded to Sentry', async () => {
    // Default model (gpt-4o-mini) selects the OpenAI provider; no key is set.
    // This is the expected state for customers who never enabled AI chat, so
    // it must stay below the Sentry transport threshold (warn).
    const logger = await buildRouter({});

    const infoMessages = messagesFor(logger.info as jest.Mock);
    const warnMessages = messagesFor(logger.warn as jest.Mock);

    expect(infoMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('no OpenAI API key configured'),
      ]),
    );
    expect(warnMessages).not.toEqual(
      expect.arrayContaining([expect.stringContaining('OpenAI API key')]),
    );
  });

  it('still warns when an explicitly selected Anthropic model has no key', async () => {
    // A genuine misconfiguration (operator chose a claude model but set no
    // key) should remain a warning and reach Sentry.
    const logger = await buildRouter({
      aiChat: { model: 'claude-sonnet-4-5' },
    });

    const warnMessages = messagesFor(logger.warn as jest.Mock);
    expect(warnMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('No Anthropic API key configured'),
      ]),
    );
  });

  it('selects Vertex for a gemini model with full google config, without the OpenAI info log', async () => {
    // A gemini-* model with project, location and a service-account JSON that
    // exists on disk is fully configured: it must not warn, and must not fall
    // through to the "no OpenAI API key" info branch meant for the default
    // OpenAI provider.
    const dir = mkdtempSync(join(tmpdir(), 'gvertex-'));
    const keyFilename = join(dir, 'credentials.json');
    writeFileSync(keyFilename, '{"type":"service_account"}');
    try {
      const logger = await buildRouter({
        aiChat: {
          model: 'gemini-2.5-flash',
          google: {
            project: 'my-project',
            location: 'europe-west1',
            keyFilename,
          },
        },
      });

      const infoMessages = messagesFor(logger.info as jest.Mock);
      const warnMessages = messagesFor(logger.warn as jest.Mock);

      expect(infoMessages).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining('no OpenAI API key configured'),
        ]),
      );
      expect(warnMessages).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining('Google Vertex model selected'),
        ]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when a gemini model is selected but google config is incomplete', async () => {
    // Operator chose a gemini model but left project/location/credentials
    // unset -- a genuine misconfiguration that should reach Sentry.
    const logger = await buildRouter({
      aiChat: { model: 'gemini-2.5-flash' },
    });

    const warnMessages = messagesFor(logger.warn as jest.Mock);
    expect(warnMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Google Vertex model selected'),
      ]),
    );
  });

  it('warns when a gemini keyFilename is set but the SA JSON is not mounted', async () => {
    // The production path: the shipped app-config always sets
    // aiChat.google.keyFilename, so a valid-looking config can still be missing
    // its mounted secret. A path string is not enough -- the file must exist,
    // otherwise the first /chat request fails when google-auth-library reads it.
    const logger = await buildRouter({
      aiChat: {
        model: 'gemini-2.5-flash',
        google: {
          project: 'my-project',
          location: 'europe-west1',
          keyFilename: join(
            tmpdir(),
            'definitely-not-mounted-credentials.json',
          ),
        },
      },
    });

    const warnMessages = messagesFor(logger.warn as jest.Mock);
    expect(warnMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Google Vertex model selected'),
      ]),
    );
  });
});

describe('createRouter with Claude on Google Vertex AI', () => {
  it(
    'does not ask for an Anthropic API key when the claude model is routed to Vertex',
    withMountedServiceAccount(async keyFilename => {
      const logger = await buildRouter({
        aiChat: {
          model: 'claude-sonnet-5',
          anthropic: { provider: 'vertex' },
          google: { project: 'my-project', location: 'global', keyFilename },
        },
      });

      expect(messagesFor(logger.warn as jest.Mock)).not.toEqual(
        expect.arrayContaining([expect.stringContaining('Anthropic API key')]),
      );
      expect(messagesFor(logger.info as jest.Mock)).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining('no OpenAI API key configured'),
        ]),
      );
    }),
  );

  it('warns when Claude on Vertex is selected but the google config is incomplete', async () => {
    const logger = await buildRouter({
      aiChat: { model: 'claude-sonnet-5', anthropic: { provider: 'vertex' } },
    });

    expect(messagesFor(logger.warn as jest.Mock)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Claude on Google Vertex AI selected'),
      ]),
    );
  });

  it(
    'points at the vertex provider when a claude model has no key but Vertex is configured',
    withMountedServiceAccount(async keyFilename => {
      // The provider is never switched implicitly, so the warning has to name
      // the key that switches it.
      const logger = await buildRouter({
        aiChat: {
          model: 'claude-sonnet-5',
          google: { project: 'my-project', location: 'global', keyFilename },
        },
      });

      expect(messagesFor(logger.warn as jest.Mock)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('aiChat.anthropic.provider to vertex'),
        ]),
      );
    }),
  );

  it(
    'reports the Vertex Anthropic provider as configured on /health',
    withMountedServiceAccount(async keyFilename => {
      const health = await getHealth({
        aiChat: {
          model: 'claude-sonnet-5',
          anthropic: { provider: 'vertex' },
          google: { project: 'my-project', location: 'global', keyFilename },
        },
      });

      expect(health).toMatchObject({
        model: 'claude-sonnet-5',
        provider: 'google-vertex-anthropic',
        configured: true,
        googleConfigured: true,
        anthropicConfigured: false,
      });
    }),
  );

  it(
    'keeps reporting the Anthropic API for a keyed install that also configures Vertex',
    withMountedServiceAccount(async keyFilename => {
      const health = await getHealth({
        aiChat: {
          model: 'claude-sonnet-4-5',
          anthropic: { apiKey: 'k' },
          google: { project: 'my-project', location: 'global', keyFilename },
        },
      });

      expect(health).toMatchObject({
        provider: 'anthropic',
        configured: true,
      });
    }),
  );
});

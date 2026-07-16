import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mockServices } from '@backstage/backend-test-utils';
import type { JsonObject } from '@backstage/types';
import type { ConversationStore } from './services/ConversationStore';
import { createRouter } from './router';

function buildRouter(configData: JsonObject) {
  const logger = mockServices.logger.mock();
  const config = mockServices.rootConfig({ data: configData });
  return createRouter({
    auth: mockServices.auth(),
    httpAuth: mockServices.httpAuth(),
    logger,
    config,
    conversationStore: {} as ConversationStore,
  }).then(() => logger);
}

function messagesFor(mock: jest.Mock): string[] {
  return mock.mock.calls.map(call => String(call[0]));
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

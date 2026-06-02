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
});

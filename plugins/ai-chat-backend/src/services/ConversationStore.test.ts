import {
  mockServices,
  TestDatabaseId,
  TestDatabases,
} from '@backstage/backend-test-utils';
import { UIMessage } from 'ai';
import { ConversationStore } from './ConversationStore';

jest.setTimeout(60_000);

function userMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function assistantMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

describe('ConversationStore', () => {
  const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

  async function createStore(databaseId: TestDatabaseId) {
    const knex = await databases.init(databaseId);
    const database = mockServices.database({
      knex,
      migrations: { skip: true },
    });
    const logger = mockServices.logger.mock();
    const store = await ConversationStore.create({ database, logger });
    return { store, knex };
  }

  it.each(databases.eachSupportedId())(
    'persists a brand-new conversation, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const messages = [userMessage('m1', 'hello world')];

      const saved = await store.saveConversation(
        'user:default/alice',
        messages,
      );

      expect(saved.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(saved.messages).toEqual(messages);
      expect(saved.preview).toBe('hello world');
      expect(saved.isStarred).toBe(false);
      expect(saved.title).toBeUndefined();
    },
  );

  it.each(databases.eachSupportedId())(
    'updates an existing conversation when called with the same id, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const userRef = 'user:default/alice';

      await store.saveConversation(userRef, [userMessage('m1', 'hi')], id);
      const updated = await store.saveConversation(
        userRef,
        [userMessage('m1', 'hi'), assistantMessage('m2', 'hello!')],
        id,
      );

      expect(updated.id).toBe(id);
      expect(updated.messages).toHaveLength(2);

      const fetched = await store.getConversationById(userRef, id);
      expect(fetched?.messages).toHaveLength(2);
    },
  );

  it.each(databases.eachSupportedId())(
    'preserves preview from the first save, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const userRef = 'user:default/alice';

      await store.saveConversation(userRef, [userMessage('m1', 'first')], id);
      // Second save with a different first user message — preview should not flip
      await store.saveConversation(
        userRef,
        [userMessage('m2', 'second'), assistantMessage('m3', 'reply')],
        id,
      );

      const fetched = await store.getConversationById(userRef, id);
      expect(fetched?.preview).toBe('first');
    },
  );

  it.each(databases.eachSupportedId())(
    'scopes reads and writes by user, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const alice = 'user:default/alice';
      const bob = 'user:default/bob';

      const aliceConv = await store.saveConversation(alice, [
        userMessage('m1', 'alice msg'),
      ]);

      // Bob cannot read Alice's conversation
      expect(await store.getConversationById(bob, aliceConv.id)).toBeNull();

      // Bob's list does not include Alice's row
      const bobList = await store.getConversations(bob);
      expect(bobList).toHaveLength(0);

      // Bob cannot delete Alice's conversation
      expect(await store.deleteConversation(bob, aliceConv.id)).toBe(false);

      // Alice still has her conversation
      expect(
        await store.getConversationById(alice, aliceConv.id),
      ).not.toBeNull();
    },
  );

  it.each(databases.eachSupportedId())(
    'lists conversations sorted by updated_at desc, %p',
    async databaseId => {
      const { store, knex } = await createStore(databaseId);
      const userRef = 'user:default/alice';

      const a = await store.saveConversation(userRef, [userMessage('m1', 'a')]);
      const b = await store.saveConversation(userRef, [userMessage('m1', 'b')]);
      const c = await store.saveConversation(userRef, [userMessage('m1', 'c')]);

      // Force a known ordering via direct updated_at writes.
      await knex('ai_chat_conversations')
        .where({ id: a.id })
        .update({ updated_at: new Date('2026-01-01T00:00:00Z') });
      await knex('ai_chat_conversations')
        .where({ id: b.id })
        .update({ updated_at: new Date('2026-02-01T00:00:00Z') });
      await knex('ai_chat_conversations')
        .where({ id: c.id })
        .update({ updated_at: new Date('2026-03-01T00:00:00Z') });

      const list = await store.getConversations(userRef);
      expect(list.map(item => item.id)).toEqual([c.id, b.id, a.id]);
    },
  );

  it.each(databases.eachSupportedId())(
    'deletes single and bulk conversations only for the owning user, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const alice = 'user:default/alice';
      const bob = 'user:default/bob';

      const a = await store.saveConversation(alice, [userMessage('m1', 'a')]);
      const b = await store.saveConversation(alice, [userMessage('m1', 'b')]);
      const c = await store.saveConversation(alice, [userMessage('m1', 'c')]);
      const bobConv = await store.saveConversation(bob, [
        userMessage('m1', 'bob'),
      ]);

      expect(await store.deleteConversation(alice, a.id)).toBe(true);
      expect(await store.deleteConversation(alice, a.id)).toBe(false); // gone
      expect(await store.deleteConversation(alice, bobConv.id)).toBe(false); // not owner

      // Bulk delete: Alice provides her own ids plus Bob's; only her own get deleted.
      const deleted = await store.deleteConversations(alice, [
        b.id,
        c.id,
        bobConv.id,
      ]);
      expect(deleted).toBe(2);

      expect(await store.getConversationById(bob, bobConv.id)).not.toBeNull();
    },
  );

  it.each(databases.eachSupportedId())(
    'toggleStarred returns null for missing conversation and flips state otherwise, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const userRef = 'user:default/alice';
      const conv = await store.saveConversation(userRef, [
        userMessage('m1', 'hi'),
      ]);

      expect(
        await store.toggleStarred(
          userRef,
          '00000000-0000-0000-0000-000000000000',
        ),
      ).toBeNull();

      expect(await store.toggleStarred(userRef, conv.id)).toBe(true);
      expect(await store.toggleStarred(userRef, conv.id)).toBe(false);
    },
  );

  it.each(databases.eachSupportedId())(
    'updateTitle returns false for missing conversation and persists otherwise, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const userRef = 'user:default/alice';
      const conv = await store.saveConversation(userRef, [
        userMessage('m1', 'hi'),
      ]);

      expect(
        await store.updateTitle(
          userRef,
          '00000000-0000-0000-0000-000000000000',
          'x',
        ),
      ).toBe(false);

      expect(await store.updateTitle(userRef, conv.id, 'My title')).toBe(true);
      const fetched = await store.getConversationById(userRef, conv.id);
      expect(fetched?.title).toBe('My title');
    },
  );

  it.each(databases.eachSupportedId())(
    'truncates long previews to 200 chars and is null when no user text, %p',
    async databaseId => {
      const { store } = await createStore(databaseId);
      const userRef = 'user:default/alice';
      const longText = 'x'.repeat(500);

      const a = await store.saveConversation(userRef, [
        userMessage('m1', longText),
      ]);
      expect(a.preview).toHaveLength(200);
      expect(a.preview!.endsWith('...')).toBe(true);

      const b = await store.saveConversation(userRef, [
        assistantMessage('m1', 'no user message'),
      ]);
      expect(b.preview).toBeUndefined();
    },
  );
});

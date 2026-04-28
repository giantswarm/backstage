import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import type { ConversationStore } from '../services/ConversationStore';
import { createConversationRoutes } from './conversationRoutes';

const VALID_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

function buildApp(store: Partial<jest.Mocked<ConversationStore>>) {
  const router = createConversationRoutes({
    store: store as unknown as ConversationStore,
    httpAuth: mockServices.httpAuth(),
    logger: mockServices.logger.mock(),
  });
  return express().use(express.json()).use(router);
}

describe('conversationRoutes', () => {
  describe('GET /:id', () => {
    it('returns 400 for invalid uuid', async () => {
      const app = buildApp({});
      const res = await request(app).get('/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id format' });
    });

    it('returns 404 when the conversation is missing', async () => {
      const store = { getConversationById: jest.fn().mockResolvedValue(null) };
      const res = await request(buildApp(store)).get(`/${VALID_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns the conversation for the authenticated user', async () => {
      const conversation = {
        id: VALID_ID,
        userId: 'user:default/mock',
        messages: [],
        isStarred: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const store = {
        getConversationById: jest.fn().mockResolvedValue(conversation),
      };
      const res = await request(buildApp(store)).get(`/${VALID_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(VALID_ID);
      expect(store.getConversationById).toHaveBeenCalledWith(
        'user:default/mock',
        VALID_ID,
      );
    });
  });

  describe('GET /', () => {
    it('returns the user-scoped list with count', async () => {
      const store = {
        getConversations: jest.fn().mockResolvedValue([{ id: VALID_ID }]),
      };
      const res = await request(buildApp(store)).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        conversations: [{ id: VALID_ID }],
        count: 1,
      });
      expect(store.getConversations).toHaveBeenCalledWith('user:default/mock');
    });
  });

  describe('DELETE /:id', () => {
    it('returns 400 for invalid uuid', async () => {
      const res = await request(buildApp({})).delete('/garbage');
      expect(res.status).toBe(400);
    });

    it('returns 404 when nothing was deleted', async () => {
      const store = { deleteConversation: jest.fn().mockResolvedValue(false) };
      const res = await request(buildApp(store)).delete(`/${VALID_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns 204 on success', async () => {
      const store = { deleteConversation: jest.fn().mockResolvedValue(true) };
      const res = await request(buildApp(store)).delete(`/${VALID_ID}`);
      expect(res.status).toBe(204);
      expect(store.deleteConversation).toHaveBeenCalledWith(
        'user:default/mock',
        VALID_ID,
      );
    });
  });

  describe('POST /batch-delete', () => {
    it('rejects empty array', async () => {
      const res = await request(buildApp({}))
        .post('/batch-delete')
        .send({ ids: [] });
      expect(res.status).toBe(400);
    });

    it('rejects non-uuid entries', async () => {
      const res = await request(buildApp({}))
        .post('/batch-delete')
        .send({ ids: [VALID_ID, 'nope'] });
      expect(res.status).toBe(400);
    });

    it('returns the count from the store', async () => {
      const store = { deleteConversations: jest.fn().mockResolvedValue(2) };
      const res = await request(buildApp(store))
        .post('/batch-delete')
        .send({ ids: [VALID_ID, OTHER_ID] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 2 });
      expect(store.deleteConversations).toHaveBeenCalledWith(
        'user:default/mock',
        [VALID_ID, OTHER_ID],
      );
    });
  });

  describe('PATCH /:id/star', () => {
    it('returns 404 when missing', async () => {
      const store = { toggleStarred: jest.fn().mockResolvedValue(null) };
      const res = await request(buildApp(store)).patch(`/${VALID_ID}/star`);
      expect(res.status).toBe(404);
    });

    it('returns the toggled state', async () => {
      const store = { toggleStarred: jest.fn().mockResolvedValue(true) };
      const res = await request(buildApp(store)).patch(`/${VALID_ID}/star`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isStarred: true });
    });
  });

  describe('PATCH /:id/title', () => {
    it('returns 400 when title is not a string', async () => {
      const res = await request(buildApp({}))
        .patch(`/${VALID_ID}/title`)
        .send({ title: 123 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/string/);
    });

    it('returns 400 when title exceeds 255 characters', async () => {
      const res = await request(buildApp({}))
        .patch(`/${VALID_ID}/title`)
        .send({ title: 'x'.repeat(256) });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/too long/);
    });

    it('returns 400 when trimmed title is empty', async () => {
      const store = { updateTitle: jest.fn() };
      const res = await request(buildApp(store))
        .patch(`/${VALID_ID}/title`)
        .send({ title: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/empty/);
      expect(store.updateTitle).not.toHaveBeenCalled();
    });

    it('returns 404 when conversation is missing', async () => {
      const store = { updateTitle: jest.fn().mockResolvedValue(false) };
      const res = await request(buildApp(store))
        .patch(`/${VALID_ID}/title`)
        .send({ title: 'New' });
      expect(res.status).toBe(404);
    });

    it('persists the trimmed title and returns it', async () => {
      const store = { updateTitle: jest.fn().mockResolvedValue(true) };
      const res = await request(buildApp(store))
        .patch(`/${VALID_ID}/title`)
        .send({ title: '  My title  ' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ title: 'My title' });
      expect(store.updateTitle).toHaveBeenCalledWith(
        'user:default/mock',
        VALID_ID,
        'My title',
      );
    });
  });
});

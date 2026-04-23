import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';
import { ConversationStore } from '../services/ConversationStore';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

const MAX_CONVERSATION_LIMIT = 100;

export interface ConversationRoutesDeps {
  store: ConversationStore;
  httpAuth: HttpAuthService;
  logger: LoggerService;
}

export function createConversationRoutes(
  deps: ConversationRoutesDeps,
): express.Router {
  const { store, httpAuth, logger } = deps;
  const router = Router();

  router.get('/', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user'],
    });
    const userId = credentials.principal.userEntityRef;

    let limit: number | undefined;
    if (req.query.limit) {
      const parsed = parseInt(req.query.limit as string, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > MAX_CONVERSATION_LIMIT) {
        return res.status(400).json({
          error: `Limit must be between 1 and ${MAX_CONVERSATION_LIMIT}`,
        });
      }
      limit = parsed;
    }

    try {
      const conversations = await store.getConversations(userId, limit);
      return res.json({ conversations, count: conversations.length });
    } catch (error: any) {
      if (error?.message?.includes('no such table')) {
        return res.json({ conversations: [], count: 0 });
      }
      logger.error(`Failed to retrieve conversations: ${error}`);
      return res
        .status(500)
        .json({ error: 'Failed to retrieve conversations' });
    }
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    const credentials = await httpAuth.credentials(req, {
      allow: ['user'],
    });
    const userId = credentials.principal.userEntityRef;

    try {
      const conversation = await store.getConversationById(userId, id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      return res.json(conversation);
    } catch (error: any) {
      if (error?.message?.includes('no such table')) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      logger.error(`Failed to retrieve conversation ${id}: ${error}`);
      return res.status(500).json({ error: 'Failed to retrieve conversation' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    const credentials = await httpAuth.credentials(req, {
      allow: ['user'],
    });
    const userId = credentials.principal.userEntityRef;

    try {
      const deleted = await store.deleteConversation(userId, id);
      if (!deleted) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      return res.status(204).send();
    } catch (error) {
      logger.error(`Failed to delete conversation ${id}: ${error}`);
      return res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  router.patch('/:id/star', async (req, res) => {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    const credentials = await httpAuth.credentials(req, {
      allow: ['user'],
    });
    const userId = credentials.principal.userEntityRef;

    try {
      const isStarred = await store.toggleStarred(userId, id);
      if (isStarred === null) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      return res.json({ isStarred });
    } catch (error) {
      logger.error(`Failed to toggle star for conversation ${id}: ${error}`);
      return res.status(500).json({ error: 'Failed to update conversation' });
    }
  });

  router.patch('/:id/title', async (req, res) => {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    const { title } = req.body;
    if (typeof title !== 'string') {
      return res.status(400).json({ error: 'Title must be a string' });
    }
    if (title.length > 255) {
      return res
        .status(400)
        .json({ error: 'Title too long (max 255 characters)' });
    }

    const credentials = await httpAuth.credentials(req, {
      allow: ['user'],
    });
    const userId = credentials.principal.userEntityRef;

    try {
      await store.updateTitle(userId, id, title.trim());
      return res.json({ title: title.trim() });
    } catch (error) {
      logger.error(`Failed to update title for conversation ${id}: ${error}`);
      return res.status(500).json({ error: 'Failed to update conversation' });
    }
  });

  return router;
}

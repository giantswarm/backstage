import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import {
  DatabaseService,
  LoggerService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { UIMessage } from 'ai';

const TABLE_NAME = 'ai_chat_conversations';
const DEFAULT_DISPLAY_LIMIT = 50;
const MAX_DISPLAY_LIMIT = 100;

const migrationsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-ai-chat-backend',
  'migrations',
);

export interface ConversationRecord {
  id: string;
  userId: string;
  messages: UIMessage[];
  title?: string;
  preview?: string;
  isStarred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ConversationRow {
  id: string;
  user_id: string;
  messages: string;
  title: string | null;
  preview: string | null;
  is_starred: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationStoreOptions {
  database: DatabaseService;
  logger: LoggerService;
}

const MAX_PREVIEW_LENGTH = 200;

function extractPreview(messages: UIMessage[]): string | null {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return null;

  const text = firstUserMessage.parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join(' ')
    .trim();

  if (!text) return null;

  return text.length <= MAX_PREVIEW_LENGTH
    ? text
    : `${text.slice(0, MAX_PREVIEW_LENGTH - 3)}...`;
}

export class ConversationStore {
  static async create(
    options: ConversationStoreOptions,
  ): Promise<ConversationStore> {
    const { database, logger } = options;
    const client = await database.getClient();

    await client.migrate.latest({
      directory: migrationsDir,
    });

    logger.info('AI Chat database migrations completed');

    return new ConversationStore(client, logger);
  }

  private constructor(
    private readonly db: Knex,
    private readonly logger: LoggerService,
  ) {}

  async saveConversation(
    userId: string,
    messages: UIMessage[],
    conversationId?: string,
  ): Promise<ConversationRecord> {
    const id = conversationId || randomUUID();
    const now = new Date();
    const preview = extractPreview(messages);

    try {
      if (conversationId) {
        const existing = await this.db(TABLE_NAME)
          .where({ id: conversationId, user_id: userId })
          .first();

        if (existing) {
          const updateData: Record<string, unknown> = {
            messages: JSON.stringify(messages),
            updated_at: now,
          };
          // Only set preview if not already populated
          if (!existing.preview && preview) {
            updateData.preview = preview;
          }

          await this.db(TABLE_NAME)
            .where({ id: conversationId, user_id: userId })
            .update(updateData);

          return {
            id,
            userId,
            messages,
            title: existing.title || undefined,
            preview: existing.preview || preview || undefined,
            isStarred: existing.is_starred || false,
            createdAt: new Date(existing.created_at),
            updatedAt: now,
          };
        }
      }

      await this.db(TABLE_NAME).insert({
        id,
        user_id: userId,
        messages: JSON.stringify(messages),
        title: null,
        preview,
        is_starred: false,
        created_at: now,
        updated_at: now,
      });

      return {
        id,
        userId,
        messages,
        title: undefined,
        preview: preview || undefined,
        isStarred: false,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      this.logger.error(`Failed to save conversation: ${error}`);
      throw error;
    }
  }

  async getConversations(
    userId: string,
    limit?: number,
  ): Promise<Omit<ConversationRecord, 'messages'>[]> {
    try {
      const displayLimit = Math.min(
        limit || DEFAULT_DISPLAY_LIMIT,
        MAX_DISPLAY_LIMIT,
      );

      const rows = await this.db(TABLE_NAME)
        .select(
          'id',
          'user_id',
          'title',
          'preview',
          'is_starred',
          'created_at',
          'updated_at',
        )
        .where({ user_id: userId })
        .orderBy('updated_at', 'desc')
        .limit(displayLimit);

      return rows.map(row => this.rowToListRecord(row));
    } catch (error) {
      this.logger.error(
        `Failed to retrieve conversations for user ${userId}: ${error}`,
      );
      throw error;
    }
  }

  async getConversationById(
    userId: string,
    id: string,
  ): Promise<ConversationRecord | null> {
    try {
      const row = await this.db(TABLE_NAME)
        .where({ id, user_id: userId })
        .first();

      if (!row) {
        return null;
      }

      return this.rowToRecord(row);
    } catch (error) {
      this.logger.error(
        `Failed to retrieve conversation ${id} for user ${userId}: ${error}`,
      );
      throw error;
    }
  }

  async deleteConversation(userId: string, id: string): Promise<boolean> {
    try {
      const deleted = await this.db(TABLE_NAME)
        .where({ id, user_id: userId })
        .delete();
      return deleted > 0;
    } catch (error) {
      this.logger.error(`Failed to delete conversation ${id}: ${error}`);
      throw error;
    }
  }

  async deleteConversations(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      return await this.db(TABLE_NAME)
        .where('user_id', userId)
        .whereIn('id', ids)
        .delete();
    } catch (error) {
      this.logger.error(
        `Failed to delete ${ids.length} conversations: ${error}`,
      );
      throw error;
    }
  }

  async toggleStarred(userId: string, id: string): Promise<boolean | null> {
    try {
      const existing = await this.db(TABLE_NAME)
        .where({ id, user_id: userId })
        .first();

      if (!existing) {
        return null;
      }

      const newStarredStatus = !existing.is_starred;

      await this.db(TABLE_NAME).where({ id, user_id: userId }).update({
        is_starred: newStarredStatus,
        updated_at: new Date(),
      });

      return newStarredStatus;
    } catch (error) {
      this.logger.error(
        `Failed to toggle starred for conversation ${id}: ${error}`,
      );
      throw error;
    }
  }

  async updateTitle(
    userId: string,
    id: string,
    title: string,
  ): Promise<boolean> {
    try {
      const updated = await this.db(TABLE_NAME)
        .where({ id, user_id: userId })
        .update({
          title,
          updated_at: new Date(),
        });
      return updated > 0;
    } catch (error) {
      this.logger.error(
        `Failed to update title for conversation ${id}: ${error}`,
      );
      throw error;
    }
  }

  private rowToRecord(row: ConversationRow): ConversationRecord {
    let messages: UIMessage[] = [];

    try {
      messages = JSON.parse(row.messages);
    } catch (error) {
      this.logger.error(
        `Corrupted messages JSON for conversation ${row.id}, returning empty array`,
      );
    }

    return {
      id: row.id,
      userId: row.user_id,
      messages,
      title: row.title || undefined,
      preview: row.preview || undefined,
      isStarred: row.is_starred || false,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToListRecord(
    row: Omit<ConversationRow, 'messages'>,
  ): Omit<ConversationRecord, 'messages'> {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title || undefined,
      preview: row.preview || undefined,
      isStarred: row.is_starred || false,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

/**
 * Creates the ai_chat_conversations table for storing chat history.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('ai_chat_conversations', table => {
    table.comment('Stores chat conversation history for AI Chat plugin');

    table
      .uuid('id')
      .primary()
      .notNullable()
      .comment('Unique identifier for the conversation');

    table
      .string('user_id')
      .notNullable()
      .comment('User entity ref who owns this conversation');

    table.text('messages').notNullable().comment('JSON array of chat messages');

    table
      .string('title', 255)
      .nullable()
      .comment('AI-generated or user-edited conversation title');

    table
      .boolean('is_starred')
      .notNullable()
      .defaultTo(false)
      .comment('Whether the conversation is starred/favorited');

    table
      .timestamp('created_at')
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment('Timestamp when the conversation was created');

    table
      .timestamp('updated_at')
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment('Timestamp when the conversation was last updated');

    table.index('user_id', 'idx_ai_chat_conversations_user_id');
    table.index(
      ['user_id', 'updated_at'],
      'idx_ai_chat_conversations_user_updated',
    );
    table.index(
      ['user_id', 'is_starred'],
      'idx_ai_chat_conversations_user_starred',
    );
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('ai_chat_conversations');
};

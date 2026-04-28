/**
 * Adds a preview column to store the first user message text
 * for display in conversation lists without loading full messages.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('ai_chat_conversations', table => {
    table
      .text('preview')
      .nullable()
      .comment('Preview text from the first user message');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('ai_chat_conversations', table => {
    table.dropColumn('preview');
  });
};

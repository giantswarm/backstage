/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('repo_content', table => {
    table.string('repo_slug', 255).notNullable().primary();
    table.text('content').notNullable();
    table.timestamp('fetched_at', { useTz: true }).notNullable();
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('repo_content');
};

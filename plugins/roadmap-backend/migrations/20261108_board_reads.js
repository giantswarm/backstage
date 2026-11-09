/**
 * Creates roadmap_board_reads: each person's board reads, shared by every
 * backend instance and kept across restarts.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('roadmap_board_reads', table => {
    table.comment(
      'Roadmap board reads of each person, made with their own GitHub grant',
    );
    table
      .string('user_ref', 255)
      .notNullable()
      .comment('User entity ref of the person the read belongs to');
    table
      .string('kind', 32)
      .notNullable()
      .comment('What was read: items, schema, item, by-issue, sub-issues');
    table.string('key_hash', 64).notNullable().comment('SHA-256 of read_key');
    table.text('read_key').notNullable().comment('The arguments of the read');
    table.text('data').notNullable().comment('JSON of what pro answered');
    table
      .bigInteger('read_at')
      .notNullable()
      .comment('Epoch milliseconds of the read');
    table.primary(['user_ref', 'kind', 'key_hash']);
    table.index(['read_at'], 'roadmap_board_reads_read_at_idx');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('roadmap_board_reads');
};

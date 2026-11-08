/**
 * Creates plans_content_reads: each person's file reads, shared by every
 * backend instance and kept across restarts.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('plans_content_reads', table => {
    table.comment(
      'Plan and magazine file reads of each person, made with their own GitHub grant',
    );
    table
      .string('user_ref', 255)
      .notNullable()
      .comment('User entity ref of the person the read belongs to');
    table.string('key_hash', 64).notNullable().comment('SHA-256 of read_key');
    table
      .text('read_key')
      .notNullable()
      .comment('The repository, ref and path read');
    table
      .text('content', 'longtext')
      .notNullable()
      .comment('The file content GitHub answered');
    table
      .bigInteger('read_at')
      .notNullable()
      .comment('Epoch milliseconds of the read');
    table.primary(['user_ref', 'key_hash']);
    table.index(['read_at'], 'plans_content_reads_read_at_idx');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('plans_content_reads');
};

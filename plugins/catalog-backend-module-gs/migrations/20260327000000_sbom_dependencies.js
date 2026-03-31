/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('sbom_dependencies', table => {
    table.string('repo_slug', 255).notNullable();
    table.string('dependency_name', 255).notNullable();
    table.primary(['repo_slug', 'dependency_name']);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('sbom_dependencies');
};

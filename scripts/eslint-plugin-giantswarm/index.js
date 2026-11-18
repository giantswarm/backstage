/*
 * The repository's own ESLint rules, loaded by the root `.eslintrc.js` as the
 * `giantswarm` plugin.
 *
 * `no-restricted-imports` is ESLint's core rule under a rule id of its own.
 * @backstage/cli's eslint-factory configures the core `no-restricted-imports`
 * in every package's config, which overrides the root's, and the root's
 * `@typescript-eslint/no-restricted-imports` warns (the MUI migration debt).
 * This id carries the restrictions that fail CI.
 *
 * `no-restricted-syntax` is the same trick for ESLint's core rule of that
 * name, which the eslint-factory configures in every package too.
 *
 * `no-restricted-bui-syntax` is that core rule once more, for the bui
 * restrictions: ESLint keeps one set of options per rule id, so selectors for
 * every file cannot share an id with selectors for some files.
 *
 * `no-fixture-imports` is `no-restricted-imports` once more, for the static
 * imports of fixture modules (docs/fixtures.md), for the same reason.
 */
const { builtinRules } = require('eslint/use-at-your-own-risk');

module.exports = {
  rules: {
    'no-restricted-imports': builtinRules.get('no-restricted-imports'),
    'no-restricted-syntax': builtinRules.get('no-restricted-syntax'),
    'no-restricted-bui-syntax': builtinRules.get('no-restricted-syntax'),
    'no-fixture-imports': builtinRules.get('no-restricted-imports'),
  },
};

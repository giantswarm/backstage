/*
 * The repository's own ESLint rules, loaded by the root `.eslintrc.js` as the
 * `giantswarm` plugin.
 *
 * `no-restricted-imports` is ESLint's core rule under a rule id of its own.
 * @backstage/cli's eslint-factory configures the core `no-restricted-imports`
 * in every package's config, which overrides the root's, and the root's
 * `@typescript-eslint/no-restricted-imports` warns (the MUI migration debt).
 * This id carries the restrictions that fail CI.
 */
const { builtinRules } = require('eslint/use-at-your-own-risk');

module.exports = {
  rules: {
    'no-restricted-imports': builtinRules.get('no-restricted-imports'),
  },
};

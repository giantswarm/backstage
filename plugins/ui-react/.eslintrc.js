const config = require('@backstage/cli/config/eslint-factory')(__dirname);

module.exports = {
  ...config,
  overrides: [
    ...(config.overrides ?? []),
    {
      // Storybook stories legitimately call hooks (useState, etc.) inside a
      // `render` callback to make a component interactive. The render fn isn't
      // recognised as a component by the rules-of-hooks lint, so disable it for
      // story files only — the hooks are still called unconditionally at the
      // top of each render.
      files: ['src/**/*.stories.tsx'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
      },
    },
  ],
};

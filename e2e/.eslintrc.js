// The e2e suites sit outside every workspace, so `backstage-cli repo lint`
// never reaches them and the root config has no TypeScript parser. They get
// the same factory config as a node library; `yarn lint` runs `lint:e2e`.
module.exports =
  require('@backstage/cli/config/eslint-factory').createConfigForRole(
    __dirname,
    'common-library',
  );

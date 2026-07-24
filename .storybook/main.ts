import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Single, root-level Storybook configuration for the Giant Swarm shared UI
 * library (`@giantswarm/backstage-plugin-ui-react`).
 *
 * Stories and the intro page are discovered by glob, so adding a new component
 * with a `*.stories.tsx` next to it needs no change here. The coverage gate
 * (see `scripts/check-story-coverage.mts`) fails CI when an exported `ui-react`
 * component has no story, keeping this library fully documented over time.
 */
const config: StorybookConfig = {
  stories: [
    // Intro/overview MDX first, then every ui-react story (discovered by glob,
    // so adding a component with a story needs no change here).
    '../.storybook/*.mdx',
    '../plugins/ui-react/src/**/*.stories.@(ts|tsx)',
  ],
  // Storybook 9/10 fold controls, actions, viewport, etc. into core; only the
  // docs addon (autodocs + MDX) needs to be listed.
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    // This is a docs site built in CI; no anonymous usage telemetry.
    disableTelemetry: true,
  },
  // react-docgen-typescript reads prop types *and* JSDoc comments, so the
  // auto-generated props tables carry the descriptions we add to the components.
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      // Only document props declared in our own source, not inherited DOM/MUI props.
      propFilter: prop =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
};

export default config;

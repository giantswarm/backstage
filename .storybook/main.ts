import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Single, root-level Storybook configuration for the Giant Swarm frontend.
 *
 * Covers the shared UI library (`@giantswarm/backstage-plugin-ui-react`) and
 * the presentational components of individual plugins, currently `muster`.
 *
 * Stories and the intro page are discovered by glob, so adding a new component
 * with a `*.stories.tsx` next to it needs no change here. The coverage gate
 * (see `scripts/check-story-coverage.mts`) fails CI when an exported `ui-react`
 * component has no story, keeping that library fully documented over time; the
 * gate does not (yet) cover plugin stories, which are opt-in per component.
 *
 * A plugin story must import the component by its own path
 * (`from './ToolTable'`), never through the plugin's barrel
 * (`@giantswarm/backstage-plugin-muster`): the barrel pulls the whole plugin
 * graph — including the 500-file `gs` plugin — through Vite for what is meant
 * to be a single-component page.
 */
const config: StorybookConfig = {
  stories: [
    // Intro/overview MDX first, then every story (discovered by glob, so adding
    // a component with a story needs no change here).
    '../.storybook/*.mdx',
    '../plugins/ui-react/src/**/*.stories.@(ts|tsx)',
    // Plugin components that render from props alone. The global decorator
    // supplies the theme, router and a minimal API surface — a component
    // needing `musterApiRef` or react-query needs a decorator of its own
    // before it can be storied here.
    //
    // Scoped to the one directory the Storybook CI workflow watches, not the
    // whole plugin: a story outside it would build here but be gated by
    // nothing, so a broken one would first fail some later, unrelated PR --
    // and the Pages deploy would have been broken since the merge. Widening
    // this means widening `.github/workflows/storybook.yaml` in the same
    // commit. A story added outside the glob simply does not appear in
    // Storybook, which its author sees immediately.
    '../plugins/muster/src/components/shared/**/*.stories.@(ts|tsx)',
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

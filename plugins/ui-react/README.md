# @giantswarm/backstage-plugin-ui-react

Giant Swarm's shared UI component library for our Backstage app — reusable
visual components, hooks, and utilities layered on top of bui (`@backstage/ui`),
classic core-components, and MUI v4.

## Documentation: Storybook

**Every visual component in this library is documented in Storybook**, with a
live rendering, interactive controls, an auto-generated props table, its key
variants/states, a short "what / when to use it" note, and a **migration-status
note** (whether it still uses deprecated MUI v4 or has moved to bui). You can
toggle each story between the real GS light and dark themes.

- **Hosted site (humans):** published to GitHub Pages on merge to `main`
  (`https://giantswarm.github.io/backstage/`). Link to a specific component in a
  review or discussion.
- **In-repo stories (the source of truth):** the `*.stories.tsx` file next to each
  component. Run the site locally with:

  ```bash
  yarn storybook        # dev server on http://localhost:6006
  yarn storybook:build  # static build into storybook-static/
  ```

### For agents

**Each shared component has a co-located `*.stories.tsx` demonstrating its
intended usage — read those stories as the canonical usage reference** before
extending a component or hand-rolling a duplicate. They live at:

```
plugins/ui-react/src/**/*.stories.tsx
```

Each story also records the component's **migration status** (via
`src/storybook/docs.ts`), so you can avoid recommending or extending a deprecated
MUI v4 component when bui is preferred. The repo's `.claude/skills/ui` skill
points here too.

### Coverage gate

CI fails when an exported component has no story (`yarn storybook:coverage`, wired
into `.github/workflows/storybook.yaml`). Components intentionally left without a
story go in `.storybook/story-coverage-allowlist.json` with a justification. The
gate's logic is a pure, unit-tested function in `src/storybook/storyCoverage.ts`.

## What's here

### Visual components (all storied)

`AsyncValue`, `Autocomplete`, `CodeBlock`, `ContentRow`, `DateComponent`,
`DetailsPane`, `ErrorStatus`, `ExternalLink`, `GSMarkdownContent`, `InfoCard`,
`JsonHighlight`, `MultiplePicker`, `MultipleSelect`, `NotAvailable`,
`PageHeaderActions`, `SingleSelect`, `StackedBarChart`, `StructuredMetadataList`,
`YamlEditor`, `YamlEditorFormField`, `display/ConditionMessage`,
`display/FiltersLayout`.

### Hooks (exported, not storied)

- `useContainerDimensions` — observe a container's size (used for container-query
  layouts).
- `useDetailsPane` — URL-query-param state for a deep-linkable details drawer
  (pairs with the `DetailsPane` component).
- `useFilters` — filter state with optional URL persistence.
- `useSplatBasePath` — the base path of a component mounted at a splat (`/*`) route.
- `useTableColumns` — persist table column visibility to local storage.

### Utils (exported, not storied)

- `isTableColumnHidden` — column-visibility logic for tables.
- `formatVersion` — version string formatting.
- `passwordManagerIgnoreProps` — props that tell password managers to ignore a field.
- table helpers — `semverCompareSort`, `sortAndFilterOptions`, and related.

_This plugin was created through the Backstage CLI._

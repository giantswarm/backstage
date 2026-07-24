---
name: ui
description: How to build UI in this repo — the bui (@backstage/ui) design system vs legacy @backstage/core-components + MUI v4, which to reach for, and how to read Backstage Storybook component/story source. Use when creating or changing pages, cards, layouts, buttons, or any frontend component.
---

## The three UI layers in this repo

| Layer | Import from | Status |
| --- | --- | --- |
| **bui** — the new Backstage design system | `@backstage/ui` (aka "Backstage UI", "BUI") | **Preferred for new work.** The direction we're migrating toward. |
| **core-components** — classic Backstage components | `@backstage/core-components` | Legacy but still required where bui has no equivalent (e.g. feature-rich `Table`, `Page`/`Header`/`Content` scaffolding, `Link` with route refs). |
| **Material UI v4** | `@material-ui/core` | Legacy primitives + `makeStyles`. Used for styling and gaps bui doesn't cover. [MUI v4 docs](https://v4.mui.com/). |

**Rule of thumb: reach for bui first.** Fall back to core-components / MUI v4 only
when bui lacks the piece you need. Mixing all three in one file is normal and
expected during the migration — see `ClusterAboutCard.tsx`, which imports `Grid`
from bui, `Link` from core-components, and `Box`/`Tooltip` from MUI v4 together.

`@backstage/ui` is currently `0.16.0` — a young, fast-moving package. APIs change
between releases and it is **not** a full replacement for core-components yet.
When unsure whether a bui component exists or what props it takes, check the
Storybook source (see below) rather than guessing.

## bui setup (already done)

- The plugin's `package.json` must declare `"@backstage/ui": "backstage:^"`
  (already present in `gs`, `ui-react`, `ai-chat`, and `app`).
- The global stylesheet is imported once in `packages/app/src/index.tsx`:
  `import '@backstage/ui/css/styles.css';`. Don't re-import it per component.
- We do **not** wrap the app in `BUIProvider` — bui components render against the
  existing app theme + the global CSS. (Storybook recipes use `BUIProvider`
  because they render in isolation; the real app doesn't need it.)

## bui components we actually use

Common primitives already in the codebase (import from `@backstage/ui`):

- **Layout**: `Flex`, `Grid`, `Box`, `Container`
- **Surfaces**: `Card`, `CardHeader`, `CardBody`, `CardFooter`
- **Typography**: `Text` (e.g. `<Text as="h3" variant="title-x-small" weight="bold">`)
- **Controls**: `Button`, `ButtonIcon`, `Switch`, `Link`
- **Overlay/menu**: `Tooltip`, `TooltipTrigger`, `MenuTrigger`, `Menu`, `MenuItem`
- **Data display**: `Table` + `Cell` / `CellText` / `ColumnConfig`, `List`, `ListRow`, `Avatar`
- **Page chrome**: `PluginHeader`, `Header` (the two-tier header pattern — plugin-level
  `PluginHeader` above an entity-level `Header`). NFS page headers and
  `SubPageBlueprint` tabs are rendered by the custom `GSPageLayout` swappable
  component, not directly — see "Page headers and tabs" in `docs/ui.md` before
  building a tabbed page.

### Cards: use the shared `InfoCard` wrapper

`@giantswarm/backstage-plugin-ui-react` exports an `InfoCard` built on bui's
`Card`/`CardHeader`/`CardBody`/`CardFooter` with our standard title styling and
header/footer action slots. Prefer it over hand-rolling a bui `Card` or the
core-components `InfoCard` for new cards. Source:
`plugins/ui-react/src/components/InfoCard/InfoCard.tsx`.

### Code blocks: use the shared `CodeBlock`

`@giantswarm/backstage-plugin-ui-react` exports a `CodeBlock` that renders a
monospace `<pre>` with a neutral copy-to-clipboard button (bui `ButtonIcon`,
`tertiary` variant) aligned to the top-right corner, plus a "Copy"/"Copied"
tooltip. Prefer it over hand-rolling a code block or reaching for
core-components' `CopyTextButton` — that button renders an oversized,
primary-colored `ButtonIcon` that needs margin hacks to sit right. Source:
`plugins/ui-react/src/components/CodeBlock/CodeBlock.tsx`.

### Overriding bui component sizes

bui components size themselves via **data-attribute selectors** (e.g.
`.bui-ButtonIcon[data-size="small"]` sets a fixed 32px square). Those selectors
out-specify a plain `makeStyles` class, so a MUI-style `height`/`width` override
silently doesn't take — bump specificity with `!important` (or `&&`). The icon
inside is sized separately and renders larger than body text, so shrink it with a
nested rule: `'& svg': { width: '1rem', height: '1rem' }`. `CodeBlock.tsx` is a
worked example of both.

### Tables: see the `tables` skill

The bui `Table` (data-driven `columnConfig` + `data`, cells must return
`Cell`/`CellText`) and the feature-rich core-components `Table` are both
documented in depth in the **`tables`** skill, including the choice matrix and
gotchas (loading skeleton needs `data={undefined}`). Read that skill for anything
table-related; don't duplicate it here.

## Reading Backstage Storybook source

The [Backstage Storybook](https://backstage.io/storybook/) renders components
from the upstream **`backstage/backstage` monorepo** — stories are `.stories.tsx`
files colocated with their components. There is **no separate storybook repo**,
and we do **not** run a local storybook. To learn a pattern (how a page/card is
composed, what props a bui component takes), read the story + component source
directly.

### The reliable technique: `index.json` → `importPath` → GitHub raw

Every Storybook deployment publishes a machine-readable index at
`https://backstage.io/storybook/index.json`. Each entry carries the exact source
paths:

```json
{
  "id": "recipes-pluginheader-and-header--with-tabs",
  "title": "Recipes/PluginHeader and Header",
  "importPath": "./packages/ui/src/recipes/PluginHeaderAndHeader.stories.tsx",
  "componentPath": "./packages/ui/src/components/PluginHeader/PluginHeader.tsx"
}
```

Then fetch the raw source from GitHub (strip the leading `./`):

```bash
BASE=https://raw.githubusercontent.com/backstage/backstage/master
curl -sfL "$BASE/packages/ui/src/recipes/PluginHeaderAndHeader.stories.tsx"
curl -sfL "$BASE/packages/ui/src/components/PluginHeader/PluginHeader.tsx"
```

To find the story ID for a Storybook URL: the `?path=/story/<id>` query param
**is** the entry `id`. Story IDs can drift between releases (the "Recipes/..."
example also now exists as "Backstage UI/PluginHeader") — search `index.json` by
`title` or a keyword rather than trusting an old URL. Quick lookup:

```bash
curl -sfL https://backstage.io/storybook/index.json \
  | jq '.entries | to_entries[] | select(.value.title|test("PluginHeader";"i")) | .value | {id,importPath,componentPath}'
```

### Live inspection with Chrome DevTools

Use the `chrome-devtools` MCP when you want to inspect the *rendered* result
(DOM, computed styles, a11y tree) or grab `index.json` without CORS friction:

- `new_page` / `navigate_page` to `https://backstage.io/storybook/`
- `evaluate_script` running `fetch('https://backstage.io/storybook/index.json')`
  (same-origin, so no CORS block) to pull the index or any raw story text
- `take_snapshot` for the a11y tree of a rendered story

Note: the chrome-devtools MCP has its own filesystem roots — it can't write into
the session scratchpad. Fetch text via `evaluate_script` and return it inline, or
just `curl` the GitHub raw URL from Bash instead.

## Related skills

- **`tables`** — bui `Table` vs core-components `Table`, columns, filtering, faceted sidebars.
- **`components`** — component directory structure, named exports, barrel files.
- **`upstream-search`** — searching a *local clone* of `backstage/backstage` (needs `BACKSTAGE_UPSTREAM_DIR` set; the Storybook technique above needs no clone).

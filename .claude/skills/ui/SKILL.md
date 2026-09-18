---
name: ui
description: How to build UI in this repo — the bui (@backstage/ui) design system vs legacy @backstage/core-components + MUI v4, which to reach for, and how to read Backstage Storybook component/story source. Use when creating or changing pages, cards, layouts, buttons, or any frontend component.
---

## The three UI layers in this repo

| Layer | Import from | Status |
| --- | --- | --- |
| **bui** — the new Backstage design system | `@backstage/ui` (aka "Backstage UI", "BUI") | **The default for new work.** The direction we're migrating toward. |
| **core-components** — classic Backstage components | `@backstage/core-components` | Legacy. Allowed only for the pieces bui has no equivalent for (listed below). |
| **Material UI v4** | `@material-ui/core` | Legacy. Allowed only for `makeStyles` and the gaps listed below. [MUI v4 docs](https://v4.mui.com/). |

**The rule: in new or edited UI code, import from `@backstage/ui`. Reaching for
`@material-ui/core` or `@backstage/core-components` instead requires that bui has
no equivalent — and you check that, you don't assume it.**

bui is much wider than it looks. It ships `Tabs`, `Dialog`, `Select`,
`Combobox`, `Checkbox`, `Radio`, `Switch`, `Slider`, `Tag`, `Badge`, `Alert`,
`Skeleton`, `Accordion`, `TextField`, `SearchField`, `DatePicker`,
`ToggleButtonGroup` and more — see the inventory and the swap table below. The
common failure mode is assuming a component is missing because it isn't
mentioned in a doc, and writing the MUI version instead.

### Check before you fall back

The installed package is the only authority on what exists. It moves fast, so
grep it rather than trusting any list (including this file):

```bash
grep -oE '^declare (const|function) [A-Z][A-Za-z]+' \
  node_modules/@backstage/ui/dist/index.d.ts \
  | sed -E 's/declare (const|function) //' | grep -v 'Definition$' | sort -u
```

For a component's props, grep the same `index.d.ts` for `<Name>OwnProps`, or
read its upstream story (see "Reading upstream Backstage (bui) Storybook
source" below). Don't guess at an API and don't conclude "bui doesn't have it"
without having run the grep.

### Picking an MUI v4 icon

`references/mui-v4-icons.md` lists all 1,120 `@material-ui/icons` base names
with search synonyms (e.g. `AccountBalance — bank building court money payment
structure temple transaction`), generated from the installed package version
merged with MUI's own docs-search synonym data. Grep it by concept when you
need an icon name but don't know it (e.g. `grep -i wallet` finds
`AccountBalanceWallet`) instead of guessing or opening the MUI v4 docs site.

## bui setup (already done)

- The plugin's `package.json` must declare `"@backstage/ui": "backstage:^"`
  (already present in `app` and most plugins — check with
  `grep -l '"@backstage/ui"' plugins/*/package.json`).
- The global stylesheet is imported once in `packages/app/src/index.tsx`:
  `import '@backstage/ui/css/styles.css';`. Don't re-import it per component.
- `BUIProvider` **is** mounted — `@backstage/plugin-app`'s `AppRoot` wraps the
  app in it (verified in `plugin-app` 0.5.1,
  `dist/extensions/AppRoot.esm.js`), so react-aria's `RouterProvider` is active
  and bui `href`s (`Link`, `ButtonLink`, `Tab`, `ListRow`, table `getHref`) are
  client-side routed through react-router. You don't need to add a provider, and
  you don't need `onClick` + `useNavigate` to avoid a full page reload. Some
  older comments in `plugins/agent-platform` still claim the opposite — they are
  stale. Keep such hrefs **absolute**: a relative bui href inside a splat route
  appends to the current path (the reason react-router stays pinned to v6).

## What bui gives you (0.17.0)

The full export list, so nothing here gets rebuilt in MUI by mistake. Regenerate
it with the grep above after a bui bump.

- **Layout**: `Box`, `Flex`, `Grid`, `Container`, `FullPage`
- **Surfaces**: `Card`, `CardHeader`, `CardBody`, `CardFooter` (use `ui-react`'s
  `InfoCard` wrapper — see below)
- **Typography**: `Text`
- **Page chrome**: `PluginHeader`, `Header`, `HeaderPage`,
  `HeaderMetadataStatus`, `HeaderMetadataUsers`
- **Navigation**: `Tabs`, `TabList`, `Tab`, `TabPanel`, `Link`, `ButtonLink`
- **Controls**: `Button`, `ButtonIcon`, `ToggleButton`, `ToggleButtonGroup`,
  `Switch`, `Checkbox`, `CheckboxGroup`, `Radio`, `RadioGroup`, `Slider`
- **Inputs**: `TextField`, `TextAreaField`, `NumberField`, `PasswordField`,
  `SearchField`, `SearchAutocomplete`, `Select` + `SelectItem`, `Combobox` +
  `ComboboxItem`, `DatePicker`, `DateRangePicker`, `FieldLabel`
- **Overlay/menu**: `Dialog` + `DialogTrigger`/`DialogHeader`/`DialogBody`/
  `DialogFooter`, `Popover`, `Tooltip` + `TooltipTrigger`, `MenuTrigger`,
  `Menu`, `MenuItem`, `MenuSection`, `MenuSeparator`, `SubmenuTrigger`,
  `MenuAutocomplete`
- **Data display**: `Table` + `Cell`/`CellText`/`CellProfile`/`ColumnConfig`,
  `List`, `ListRow`, `Avatar`, `Tag`, `TagGroup`, `Badge`
- **Feedback**: `Alert`, `Skeleton`
- **Disclosure**: `Accordion`, `AccordionGroup`, `AccordionTrigger`,
  `AccordionPanel`
- **A11y**: `VisuallyHidden`

### Swap table: MUI v4 → bui

Writing new UI, or touching a file that already has the MUI import? Use the
right column.

| Instead of `@material-ui/core` | Use `@backstage/ui` |
| --- | --- |
| `Typography` | `Text` (`as` + `variant` + `weight` + `color`) |
| `Tabs`, `Tab` | `Tabs` + `TabList` + `Tab` + `TabPanel` |
| `Box`, `Grid`, `Container` | `Box`, `Flex`, `Grid`, `Container` |
| `Button`, `IconButton` | `Button`, `ButtonIcon`, `ButtonLink` |
| `Chip` | `Tag` (`Badge` for a count/state pill) |
| `Dialog`, `DialogTitle/Content/Actions` | `DialogTrigger` + `Dialog` + `DialogHeader`/`DialogBody`/`DialogFooter` |
| `FormControl` + `InputLabel` + `Select` + `MenuItem` | `Select` + `SelectItem` (or `Combobox` when it needs typing) |
| `TextField`, `InputBase` | `TextField`, `TextAreaField`, `NumberField`, `PasswordField`, `SearchField` |
| `Checkbox` + `FormControlLabel` | `Checkbox`, `CheckboxGroup` |
| `Radio`, `RadioGroup` | `Radio`, `RadioGroup` |
| `Switch`, `Slider` | `Switch`, `Slider` |
| `Tooltip` | `TooltipTrigger` + `Tooltip` |
| `Menu` + `MenuItem`, `Popover` | `MenuTrigger` + `Menu` + `MenuItem`, `Popover` |
| `Accordion`/`ExpansionPanel` | `AccordionGroup` + `Accordion` + `AccordionTrigger` + `AccordionPanel` |
| `Paper`, `Card*` | `ui-react` `InfoCard` |
| `List`, `ListItem` | `List`, `ListRow` (interactive rows need `selectionMode`) |
| `Avatar` | `Avatar` |
| `CircularProgress`/`LinearProgress` as a placeholder | `Skeleton`, or the `isPending` prop on `Table`/`Alert` |
| `Snackbar`, MUI-lab `Alert` | `Alert` (`status`: `info`/`success`/`warning`/`danger`) |
| MUI-lab `ToggleButtonGroup` | `ToggleButtonGroup` + `ToggleButton` |
| MUI pickers | `DatePicker`, `DateRangePicker` |

bui `Tabs` covers both modes: in-page tabs keyed by `id`
(`<Tab id="overview">`, with `selectedKey`/`onSelectionChange` on `Tabs`) and
routed tabs (`href` + `matchStrategy: 'exact' | 'prefix'`, active state derived
from the URL). Both need a router in context, which the app always has. For
`SubPageBlueprint` tabs you don't write `Tabs` at all — `GSPageLayout` does; see
"Page headers and tabs" in `docs/ui.md`.

### The only legitimate fallbacks

This list is closed. Anything not on it should be bui:

- `makeStyles` from `@material-ui/core` — for layout/spacing tweaks bui's props
  don't express. Prefer bui layout props first; keep the styles thin.
- `@material-ui/icons/<Icon>` — bui ships no icon set (see the icon reference
  above). Always import the single-icon path.
- `Table` from `@backstage/core-components` — when you need column-visibility
  persistence, CSV export or the faceted `FiltersLayout` sidebar. See the
  **`tables`** skill for the choice matrix; bui `Table` is the default otherwise.
- `Page`/`Header`/`Content` from `@backstage/core-components` — classic
  (non-NFS) pages only. Never add them to an NFS page: double header + double
  scrollbar.
- `Link` / `LinkButton` from `@backstage/core-components` — when the target is a
  route ref. Plain hrefs use bui `Link`/`ButtonLink`.
- `Progress`, `EmptyState`, `ErrorPanel`, `WarningPanel`, `ResponseErrorPanel`,
  `MarkdownContent`, `CodeSnippet`, the `Status*` dots, `DependencyGraph`,
  `Breadcrumbs`, `LogViewer`, the sidebar/entity-page scaffolding — no bui
  equivalent yet.
- A `ui-react` component that is still MUI v4 inside (`SingleSelect`,
  `MultipleSelect`, `Autocomplete`, `MultiplePicker`, `FiltersLayout`,
  `YamlEditor`, …). **Reuse it anyway** — one shared component to migrate later
  beats a hand-rolled MUI copy per call site. The story's migration-status note
  tells you which stack each is on.

MUI and bui do coexist in many files. That is the migration's residue, not
permission: a file already importing `@material-ui/core` is a reason to migrate
the part you touch, not to add to it.

ESLint backs this up: the root `.eslintrc.js` restricts every
`@material-ui/core` export that has a bui equivalent (`muiWithBuiEquivalent`)
via `@typescript-eslint/no-restricted-imports`. It is a **warning**, because the
imports already in the tree are debt — so treat one on a line *you* wrote as a
failure, and add a name to that list if you find a swap it is missing.

Note where the warning is and isn't visible: `lint-staged` prints it on commit
for staged files, and so does `npx eslint <file>`, but **`yarn lint` does not** —
`backstage-cli repo lint` runs with `--max-warnings -1` and only prints a
package's report when that package fails. To check a file you just wrote, run
`npx eslint <path>` from the package directory, or `yarn lint --max-warnings 0`
for the whole changed package.

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

## Our shared library: the `ui-react` Storybook

Before hand-rolling a component, check whether
`@giantswarm/backstage-plugin-ui-react` already has one. It is **fully documented
in its own Storybook** — the canonical reference for what the shared library
contains and how each piece is meant to be used.

- **In-repo stories are the source of truth.** Each shared component has a
  co-located story: `plugins/ui-react/src/**/*.stories.tsx`. **Read the story as
  the authoritative usage example** rather than guessing from the component
  source. Every story also records a **migration-status note** (MUI v4 vs bui, via
  `plugins/ui-react/src/storybook/docs.ts`) — use it to avoid extending a
  deprecated MUI v4 component when bui is preferred.
- **Hosted site (for humans):** published to GitHub Pages on merge to `main`
  (`https://giantswarm.github.io/backstage/`) — link to a component in reviews.
- **Run it locally:** `yarn storybook` (dev server on
  [http://localhost:6006](http://localhost:6006)); `yarn storybook:build` for a
  static build. The theme toolbar toggles the real GS light/dark themes.
- **Coverage gate:** every exported visual component must have a story
  (`yarn storybook:coverage`, enforced in CI); config lives in the root
  `.storybook/`. See `plugins/ui-react/README.md` for the full component/hook/util
  inventory.

Components confirmed to live here (prefer them over rebuilding): `InfoCard`,
`CodeBlock` (both covered above), plus `AsyncValue`, `DateComponent`,
`ExternalLink`, `GSMarkdownContent`, `JsonHighlight`, `StructuredMetadataList`,
the select/filter controls (`SingleSelect`, `MultipleSelect`, `Autocomplete`,
`MultiplePicker`, `display/FiltersLayout`), `YamlEditor`/`YamlEditorFormField`,
`StackedBarChart`, and more.

## Reading upstream Backstage (bui) Storybook source

The [Backstage Storybook](https://backstage.io/storybook/) renders **upstream
bui** components from the **`backstage/backstage` monorepo** — stories are
`.stories.tsx` files colocated with their components. There is **no separate
upstream storybook repo**, and we do **not** run the upstream bui storybook
locally (that's distinct from our own `ui-react` Storybook above). To learn a bui
pattern (how a page/card is composed, what props a bui component takes), read the
story + component source directly.

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

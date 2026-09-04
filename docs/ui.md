# User Interface

When working with the Backstage user interface, e. g. in order to create new components, some resources will be helpful.

## Component libraries

There are three UI layers in this repo, in order of preference for new work:

- **bui** (`@backstage/ui`, aka "Backstage UI") — the new Backstage design
  system and the direction we are migrating toward. **Prefer it for new work.**
  The global stylesheet is imported once in `packages/app/src/index.tsx`.

- **core-components** (`@backstage/core-components`) — the classic Backstage
  components. Legacy, but still required where bui has no equivalent yet (e.g.
  the feature-rich `Table`, the `Page`/`Header`/`Content` scaffolding, and
  `Link` with route refs).

- [Material UI version 4](https://v4.mui.com/) (`@material-ui/core`) — legacy
  primitives and `makeStyles`, used for styling and gaps the above don't cover.

Mixing all three in one file is normal during the migration. Reach for bui
first and fall back only when a piece is missing.

## Page headers and tabs (New Frontend System)

Every NFS page header is rendered by a **custom `PageLayout` swappable
component**, `GSPageLayout`
(`packages/app/src/modules/app/GSPageLayout.tsx`), registered in
`AppOverrides.tsx` via `SwappableComponentBlueprint`. It wraps the bui
`PluginHeader`, so page titles and tabs get the bui look plus active-tab
highlighting.

`PageBlueprint` uses this component for the header of **every** page, and — when
a page has `SubPageBlueprint` sub-pages — to render those sub-pages as **tabs**
(e.g. the flux `list`/`tree` tabs, the muster section). Backstage ships only a
stub default for `PageLayout`; **if `GSPageLayout` is removed the app falls back
to that stub, whose tabs are plain relative `<a href="list">` anchors with no
active state.** That regresses tabbed pages: from `/flux/list`, clicking a tab
appends (`/flux/list/tree`) instead of switching, and no tab is highlighted.
`GSPageLayout` fixes this by turning each sub-page's relative `path` into an
absolute href.

Guidelines when building pages:

- **Tabbed pages** — declare a `PageBlueprint` (no loader) plus one
  `SubPageBlueprint` per tab, each with a **relative** `path` (`list`, `tree`).
  Keep the paths relative; `GSPageLayout` resolves them. See
  `plugins/flux/src/plugin.tsx` and `plugins/muster/src/plugin.tsx`.
- **Pages that render their own bui `PluginHeader`** (e.g. the clusters and
  deployments sections, which use the `useLayoutTabs` hook in `plugins/gs`)
  must pass `noHeader: true` to `PageBlueprint` so `GSPageLayout` skips its
  header and just renders the content — otherwise you get a double header.
- Do **not** reintroduce a classic `<Page>`/`<Header>` scaffold on an NFS page;
  it causes a double scrollbar and duplicate header under the app shell.

## Full-height sidebars and scroll containment

There is no bui `ScrollArea`, and the app shell gives a page nothing to inherit a
height from: its sidebar is `position: fixed` and sized against the viewport,
while the content column is static and content-sized, so a `height: 100%` or
`flexGrow` chain collapses to the content height. Every scroll container in this
repo is therefore hand-rolled, using one of three strategies.

1. **Sticky, page scrolls.** The panel sticks; the document keeps scrolling.
   Simplest, and impossible to get a double scrollbar out of, but the panel cannot
   scroll independently — fine for a short list, wrong for one that can outgrow
   the viewport. `plugins/plans/.../PullReviewPage`, `plugins/roadmap/.../ItemDetailPage`.

2. **Sticky with a viewport-offset `maxHeight`.** The panel scrolls internally
   while the page scrolls the rest. Use `PLUGIN_CONTENT_VIEWPORT_OFFSET` from
   `@giantswarm/backstage-plugin-ui-react` — `PluginHeader` (89) plus `Content`'s
   padding (24) — rather than writing the numbers again:

   ```ts
   maxHeight: `calc(100dvh - ${PLUGIN_CONTENT_VIEWPORT_OFFSET}px)`,
   ```

   `plugins/ai-chat/.../RecentConversations`,
   `plugins/agent-platform/.../SessionSwitcherRail`.

3. **Measured offset.** `window.innerHeight - node.getBoundingClientRect().top`,
   re-measured on resize and via a `ResizeObserver`. The only one that survives a
   banner or filter row appearing above the panel — and the only one that costs a
   measurement every time the page reflows, so it is the wrong choice on a page
   whose body grows continuously (a streaming conversation, say).
   `plugins/flux-react/.../FluxOverview/ContentContainer`.

Two things that bite:

- **Keep the flex container's default `align-items: stretch`.** A `flex-start`
  content-sizes the sticky child, which then stops travelling past its own
  height. Nothing errors; the panel just silently fails to stick.
- **Choose which element owns the scroll deliberately.** Anything already relying
  on the document scroller — a `position: sticky; bottom` dock, a
  `scrollToBottom()` writing to `document.scrollingElement`, an auto-follow —
  breaks the moment its content moves into a scroll container of its own.

## Storybook

The [Backstage Storybook](https://backstage.io/storybook/) allows to explore the
existing UI components in a number of different states. It renders stories from
the upstream `backstage/backstage` monorepo; we do not run a local storybook.

To read the source behind a story (to learn a pattern or a component's props),
use the `index.json` → `importPath` → GitHub raw technique described in the
`ui` Claude Code skill (`.claude/skills/ui/SKILL.md`).

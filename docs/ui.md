# User Interface

When working with the Backstage user interface, e. g. in order to create new components, some resources will be helpful.

## Component libraries

There are three UI layers in this repo:

- **bui** (`@backstage/ui`, aka "Backstage UI") — the new Backstage design
  system and the direction we are migrating toward. **New and edited UI code
  imports from here.** The global stylesheet is imported once in
  `packages/app/src/index.tsx`, and `BUIProvider` is mounted by
  `@backstage/plugin-app`'s `AppRoot`, so bui `href`s are client-side routed
  (keep them absolute — a relative href inside a splat route appends).

- **core-components** (`@backstage/core-components`) — the classic Backstage
  components. Legacy.

- [Material UI version 4](https://v4.mui.com/) (`@material-ui/core`) — legacy
  primitives and `makeStyles`.

The two legacy layers are for the pieces bui has no equivalent for, and that
set is smaller than it looks: `makeStyles`, `@material-ui/icons/<Icon>`, the
feature-rich core-components `Table`, the `Page`/`Header`/`Content` scaffolding
on classic (non-NFS) pages, route-ref `Link`/`LinkButton`, and `Progress` /
`EmptyState` / `ErrorPanel` / `WarningPanel` / `MarkdownContent` / `CodeSnippet`
/ the `Status*` dots / the sidebar and entity-page scaffolding.

### What to reach for instead of MUI

Everything below has a bui equivalent, and these are the ones that most often
get rebuilt in MUI by mistake:

| Instead of `@material-ui/core`                       | Use `@backstage/ui`                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `Typography`                                         | `Text`                                                                      |
| `Tabs`, `Tab`                                        | `Tabs` + `TabList` + `Tab` + `TabPanel`                                     |
| `Chip`                                               | `Tag` (`Badge` for a count/state pill)                                      |
| `Dialog`, `DialogTitle/Content/Actions`              | `DialogTrigger` + `Dialog` + `DialogHeader`/`DialogBody`/`DialogFooter`     |
| `FormControl` + `InputLabel` + `Select` + `MenuItem` | `Select` + `SelectItem`, or `Combobox`                                      |
| `TextField`, `InputBase`                             | `TextField`, `TextAreaField`, `NumberField`, `PasswordField`, `SearchField` |
| `Checkbox`, `Radio`, `Switch`, `Slider`              | same names, from bui                                                        |
| `Accordion` / `ExpansionPanel`                       | `AccordionGroup` + `Accordion` + `AccordionTrigger` + `AccordionPanel`      |
| `Paper`, `Card*`                                     | the `InfoCard` from `@giantswarm/backstage-plugin-ui-react`                 |
| `CircularProgress` as a placeholder                  | `Skeleton`, or `isPending` on `Table`/`Alert`                               |
| MUI-lab `Alert`, `Snackbar`                          | `Alert` (`status`: `info`/`success`/`warning`/`danger`)                     |

bui moves fast and this table will lag it. The installed package is the
authority on what exists:

```bash
grep -oE '^declare (const|function) [A-Z][A-Za-z]+' \
  node_modules/@backstage/ui/dist/index.d.ts \
  | sed -E 's/declare (const|function) //' | grep -v 'Definition$' | sort -u
```

MUI and bui coexist in many files. That is the migration's residue, not
permission: a file that already imports `@material-ui/core` is a reason to
migrate the part you touch, not to add to it.

ESLint backs this up: the root `.eslintrc.js` restricts every
`@material-ui/core` export that has a bui equivalent — the list is
`muiWithBuiEquivalent` — through `@typescript-eslint/no-restricted-imports`
(a different rule id from the `no-restricted-imports` that
`@backstage/cli`'s eslint-factory configures per package, so it adds to that
rather than replacing it).

It is a **warning**, because ~550 legacy imports are already in the tree. Where
you see it:

- **On commit**, for the files you staged — `lint-staged` runs `eslint --fix`
  directly, which prints warnings. Non-blocking, so read the output.
- **In your editor**, and from `npx eslint <file>`.
- **Not** in `yarn lint` / `yarn lint:all`. `backstage-cli repo lint` defaults to
  `--max-warnings -1` and prints a package's report only when that package
  _fails_, so warnings are swallowed. Use `yarn lint --max-warnings 0` when you
  want them to fail — worth doing on a package you are actively migrating,
  unusable repo-wide until the backlog is gone.

## Toasts

A toast (`toastApiRef` from `@backstage/frontend-plugin-api`) is an
acknowledgement glanced at in passing, not a place to report. It renders in a
narrow column over the page the user is already reading, so **keep it to two
lines**:

- **Title: one line, ~60 characters including any quoted name.** Say what
  happened to what — `Model "gpt-oss-120b" deleted`, `Deleting agent "Qwentin"`.
  Present participle when something is still settling behind the call (a
  finalizer, a reconcile), past tense when it is done.
- **Description: one sentence, ~140 characters.** Include it only when there is
  something the person cannot see for themselves — most often that the list
  they are being returned to will lag for a few seconds. If there is nothing
  like that, leave it out; most of our toasts are title-only.

Two things that do not belong in either:

- **The signed-in person's own name or address.** They pressed the button; a
  write running as them is the expected case, not news.
- **A backend message interpolated raw**, and above all one that can grow
  without bound — a list of the other releases referencing a shared resource, a
  set of affected objects, a stack. It is unbounded by construction, so the
  toast that fits in a test fixture is four lines in a busy namespace. Leave
  the detail to the dialog, the page, or an error panel that can be read at
  leisure, and keep the toast to the outcome. (`ToastApiMessage` also takes
  `links`, for when the detail lives somewhere the user can go.)

Always pass a `timeout` — a toast without one is permanent, and an
acknowledgement should not have to be dismissed by hand. Failures usually want
**no** toast at all: if the user is still looking at the dialog they pressed the
button in, show the message there instead.

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

---
name: agent-platform-ux-coding
description: Rules for building UI in the agent-platform shell — patterns to reuse, copy style, and the sanctioned exceptions.
---

# Agent Platform UI: UX and coding rules

Load this skill before you touch anything that renders in the agent-platform
shell: `/`, `/sessions/**`, `/usage/**`, `/profile` and `/customize/**`, built
from `plugins/agent-platform`, `plugins/muster`, the shell components in
`plugins/ui-react` and `packages/app/src/modules/agentShell`. The old
`/agent-platform/**` addresses only redirect. Where a page lives, how it is
addressed and linked, and what adding or moving one takes are the
[`urls`](../urls/SKILL.md) skill's rules.

Repository conventions (bui first, component directories, named exports,
telemetry, `useTrackedMutation`, changesets, logging) live in
[`.claude/CLAUDE.md`](../../CLAUDE.md) and the `ui`, `tables` and `components`
skills. This skill does not repeat them; it adds what is specific to the shell.
Product and configuration reference: [`docs/agent-platform.md`](../../../docs/agent-platform.md)
and [`docs/agent-platform-configuration.md`](../../../docs/agent-platform-configuration.md).

The rules below come from the product owner's decisions during the shell's
build. When a rule here and a newer PO decision disagree, the decision wins;
update this file in the same change.

## 1. Scope

- Work changes the new agent-platform UI only. The classic portal stays as it
  is on `main`; its only agent-platform touches are the sidebar link to the
  shell and the removal of the old agent-platform pages.
- Shared code counts. A change to `ui-react` (or any package classic pages
  import) must not alter a classic page's strings or behaviour. Before you
  change a shared component, list its importers and check each classic one.
- For shell-only behaviour in a shared component, read `useShellScope()` from
  `ui-react` (`ShellScope/ShellScope.tsx`). The app mounts `ShellScopeProvider`
  around the shell's pages only, so classic pages keep their behaviour
  (`InfoHint` and `FactList` are the precedents).
- Every agent-platform page extension carries `if: AGENT_SHELL_ON`
  (`plugins/agent-platform-common/src/agentShellFlag.ts`). Read the flag at
  render time only through `isAgentShellOn`, which latches it per app load so
  chrome and routes agree. Do not add `useAgentShell()`-style classic branches;
  the shell is the only renderer.
- Fixed product decisions: there is no Organization selector that scopes
  a page (a new agent's form asks whether it belongs to the platform or an
  organization, and says "Organization", never "tenant"); the
  Environment (installation) selector appears only with more than one
  installation; the UI is light mode only; workflows are not created, edited
  or deleted in the UI, but a workflow's Run it tab runs it (reversing D11's
  read-only page); runtimes, budgets, organizations and workspaces have no
  UI.
- A feature that needs a meta-agent role (`agentPlatform.metaAgents.<role>`)
  hides when the role is unconfigured, unresolvable or ambiguous. Production
  needs qualified names, a GitHub token and the avatar service; see
  [Production requirements](../../../docs/agent-platform-configuration.md#production-requirements).
- Costs use the installation's `currency` where set, else USD.

## 2. Reuse first

Before you build UI, name the existing shell pattern you reuse, or state why
none fits, in your report or PR. A new variant is allowed only when nothing in
the catalogue below can serve. Visual tokens live in
`packages/app/src/modules/agentShell/agent-shell.css` and `theme.ts`; extend
them and never invent a palette.

### Page frame and navigation

- Every page is a `ShellPage` (`ui-react`): breadcrumbs, title row, badges,
  header actions, routed tabs (`RouteTabs`) and an optional facts column that
  folds above the content at phone width.
- `ShellPage` owns the header's geometry: the actions and any `leading`
  mark sit beside the title's first line, a long title wraps beside them, and
  only a group too wide to leave the title 192px (320px with a description)
  moves under it. Actions are top-aligned 8px apart; a row with a labelled
  field (the Environment select) aligns on the bottom edge, so the field's
  box lines up with the buttons. Pass header controls as the row's own items
  (a fragment), and do not wrap, align or space them per page.
- `Breadcrumbs` leads with a back arrow to the nearest linked parent crumb.
  Navigate to the parent, never to browser history.
- `ShellPage` and `WizardFrame` set the document title through
  `ShellDocumentTitle`: most specific part first, then the section, then
  "Agent Platform". Edit flows name the resource: "Edit <name> · <Section>".
  Do not add a raw `<Helmet>`.
- Type scale beats pixel-matching an artboard. Page sections and wizard
  sub-sections use `SectionHeader` as `h2` with `variant="title-x-small"`;
  only a wizard's step heading is `title-small`. A detail page tab's sections
  are `PageSection` (`ui-react`), which draws that heading and names the
  region by it.

### Lists

- Tables are the bui `Table` with `useTable`. At phone width, use
  `StackedRowList` for lists a person acts on row by row, and `usePhoneColumns`
  (name plus one or two numbers) for analytic tables.
- Long lists render through `ShowMore` (`INITIAL_ROWS` = 20 per page,
  `revealAll` for bounded excerpts such as "Used by" at `USED_BY_ROWS` = 10).
- Search and filter chrome appear only past `SEARCH_MIN` = 8 entries, or while
  a search or filter is in force so it can be cleared. Selects use
  `searchableIf(options)` for type-ahead.
- A list that matches nothing shows `CatalogNoMatch` with "Clear filters".
- Card and row grids follow the existing presentation: avatar or tile plus
  bold name where the resource has an identity mark, stock `CellText`
  otherwise.

### Filters

- Search is the bui `SearchField`. Every data filter is a per-field dropdown
  multi-select: `CatalogFilterBar` with `useCatalogFilters`
  (`ui-react/src/components/CatalogFilters`). Never use chip or pill rows,
  segmented buttons or bespoke toggles to filter data.
- Carve-out: a static scope selector with a fixed handful of choices may stay
  a direct selection. The test is whether the control narrows a data list by a
  field (dropdown) or switches the scope or view of the whole surface (direct
  selection allowed). The PO-ruled instances are the Usage time range
  (7 | 30 | 90 toggle) and the command palette's result-type chips.
- A window of days up to today is `LastDaysPicker` (`ui-react`): "Last
  [7 | 30 | 90] days" under its label, in a field box as tall as a select, so
  it lines up with the Environment select. Its shell look lives in
  `agent-shell.css` by `LAST_DAYS_PICKER_CLASS_NAMES`. Do not use bui's stock
  `ToggleButtonGroup` beside a select; its solid selection outweighs the
  field.

### States

- Empty lists and not-found pages use `EmptyStateCard`; a not-found page adds a
  back link. A failed read of a whole page is a danger `Alert` with a back link.
- Loading a region uses `LoadingIndicator` with a "Reading …" label. Detail
  pages render their loading frame in the final geometry with
  `ShellPageTitleSkeleton`, `ShellPageBadgeSkeleton` and
  `ShellPageFactsSkeleton`, so nothing moves when data lands.
- A tab's count (`RouteTabSpec.count`, through `ShellPage`'s `tabs`) is
  `'loading'` while it is read, never left out: the tab draws a two-digit
  skeleton and keeps its width when the count lands. Leave the count out only
  when it cannot be read.
- Show loading only while there is no data (`!data && isLoading`). The
  persisted query cache reports `isLoading` during its restore, and cached
  data must render from the first commit.
- Never flash an error while the outcome is still unknown, for example between
  creating a session and its first read; show loading until the real result.
- State is a `StatusDot` plus a label from the shared vocabularies:
  `SESSION_STATE_LABELS` (`agent-platform-common`), `SERVED_MODEL_READINESS`
  (`agent-platform/src/lib/serving.ts`), `TOOL_EFFECT_LABELS` with one
  `EffectBadge` renderer (muster). Do not hand-draw dots or add a new state
  word.

### Dialogs, pages and feedback

- Create and edit flows are pages in `WizardFrame`: the step strip for
  multi-step flows, the single-step page for one form. Edit reuses the create
  flow, prefilled. Never build a create or edit form as an overlay.
- Atomic actions stay dialogs: confirm-delete, row-menu actions, rename. Use
  `ConfirmDialog` (`ui-react`).
- A destructive confirm is titled `<Verb> <noun> "<name>"?`, its button
  repeats the verb and noun ("Delete agent", "Remove model config"), it uses
  the destructive treatment, and its body lists what depends on the item. A
  removal that leaves the page confirms with a success toast.
- Toasts (`toastApiRef`) report outcomes of actions and started work; they are
  closable by default. Inline `Alert`s report a page's or dialog's own read or
  write failure. A read failure inside a form the person can still finish is a
  warning, not danger. Shell-wide banners carry a close "X" through bui
  `Alert`'s `customActions` slot.
- Header actions sit in the header; a disabled one explains why through
  `DisabledAction`, which works on hover, focus and touch. Leave an action out
  of a ⋯ menu when it cannot run, because a menu item cannot say why. Menus
  use the `MoreVert` icon.

### Fold-outs

- Technical detail is a fold-out in place, never a page-wide toggle, switch or
  stored "technical mode". Pages use a "Technical details" bui `Accordion`
  styled by `useSimpleAccordionStyles`, mounted only while open.
  Plain facts directly above it (a Details tab's, the model page's Overview)
  sit in `FoldOutAlignedSection`, which lines them up with the fold-out's
  title.
- The one page-wide switch is the session page's "Show tool activity" (PO,
  S9): it hides the agent's work, it does not change how detail reads. It is
  small, at the end of the header's meta line after "Started …", on by
  default and stored per person (`useShowToolActivity`). Off still shows
  anything that waits on the person.
- Forms put technical knobs with sensible defaults under `MoreOptions`. When
  validation blocks on a field inside it, open it in the same handler as
  `useFieldValidation`'s `reveal()`.

### Forms

- Field edges, focus rings and invalid states come from the shell's
  `--agent-shell-input-*` rules in `agent-shell.css`. Do not restyle fields per
  component.
- Validation follows the [`forms`](../forms/SKILL.md) skill: a field is
  checked when the person leaves it, a shown error follows each change until
  it is fixed, and a blocked submit shows every error and focuses the first
  invalid field, all through `useFieldValidation` (`ui-react/FieldValidation`).
  Submit buttons stay enabled. A summary box is only for problems no field can
  show.
- Mark optional fields "(optional)" consistently within a form.

### Shared helpers

- Counts: `countNoun(n, noun)`. Name lists: `joinNames` and `groupNames`.
- Numbers, durations and bytes: `formatCount`, `formatSeconds` and
  `formatBytes` in `agent-platform-common/src/formatNumbers.ts`. Relative dates:
  `getRelativeDate` (`ui-react`). Durations read "1.2 s" and "420 ms".
- Copy affordances: `CopyButton`. Manifests: `ManifestDialog`.
- Running a tool: `ToolRunPanel` (muster `ToolDetail`), the argument form,
  Run button, run note and result that a tool's page and a workflow's Run it
  tab share. Do not build a second run form or result viewer. A connector's
  and a tool's Usage tab share `UsageFigures` (muster `ConnectorPage`).
- Meta-agent hand-off strips: `MetaAgentBanner`; session starts go through
  `useMetaAgentHandoff`.
- Before writing a helper, grep `ui-react/src/utils`,
  `agent-platform-common/src` and `agent-platform/src/lib`. A second copy of a
  formatter is a defect.

## 3. Copy rules

- Copy is condensed and minimal, but prose is always full grammatical
  sentences. This covers descriptions, hints, tooltips, alerts, banners,
  dialogs and empty states.
- Every word explains something the form or surrounding UI does not already
  make clear. Cut restatements of what a control visibly does, hedges, and
  second sentences that repeat the first.
- Prefer a precise label over a label plus helper text, and helper text over a
  paragraph.
- Wrong: "Simple skills here, complex ones with X." Right: "This form is for
  simple skills; for complex ones, work with X."
- Labels, column headers, badges, counts and metadata lines stay noun phrases.
  Page descriptions are full sentences, not subjectless fragments.
- Use no contractions: "could not", "cannot", "is not".
- Error titles start with "Could not …" ("Could not stop the turn"). "This
  turn failed" is kept because it names a state, not an action.
- Docs follow the same rule. They lead with what to configure, where, and the
  options and results; they do not walk through screens or restate labels.
- Use raw apostrophes in JSX text. Jest's transform drops a leading space
  before `&apos;` after an expression.

### One vocabulary

| Concept                        | Use                                                                                                                                       | Not                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| An MCP server a person sees    | **connector**, named as Customize lists it                                                                                                | app, server, "via Muster" outside technical rows       |
| Tool presets                   | **Read-only tools**, **Full gateway**                                                                                                     | "Look things up", "Read-only tools everywhere"         |
| Muster's own tools             | **Platform tools**                                                                                                                        | platform administration tools                          |
| Gateway-priced money           | **Spend** ("Est. spend" when converted); every tile says whose                                                                            | Cost, Spend (estimated)                                |
| Token-based estimate           | **Est. cost**                                                                                                                             | Estimated cost                                         |
| Runtime-reported money         | **Reported cost**                                                                                                                         |                                                        |
| ModelConfig verdict            | `modelStatus`: Not accepted (`Accepted` False), Incomplete (`ResolvedRefs` False), Pending                                                | "Not accepted" for a missing key                       |
| Served-model readiness         | `SERVED_MODEL_READINESS` labels: Ready, Not serving, Pending, Idle                                                                        | Serving already, Not running, Available (on Customize) |
| A session with no turn running | **Idle**                                                                                                                                  | Finished                                               |
| Starting from an agent         | **Start a session** ("New session" stays the nav, home and Sessions entry); the agent page's header button alone reads **Use this agent** | Use this agent anywhere else                           |
| Interrupting the agent         | **Stop the turn**                                                                                                                         | Stop, Cancel the turn                                  |
| Owned things                   | **Delete** (agent, session, model)                                                                                                        |                                                        |
| Infrastructure registrations   | **Remove** (pool, cache, backend, connector, a running model's model config)                                                              |                                                        |
| A catalogue skill's commit     | **Latest commit**                                                                                                                         | Pinned commit                                          |
| "Used by"                      | agents only                                                                                                                               | model config, mount state                              |

## 4. Interaction rules

- Rows are real links. A name cell is a bui `CellText href` or bui `Link`
  with an absolute href, and the whole-row `getHref` stays. bui links stop the
  press from reaching the row, so no extra handler is needed.
- Every flow works from the keyboard. Escape closes the innermost layer only.
  Components with their own Escape handling (`AssistPanel`, the workflow
  full-screen layer, `DisabledAction`) say why in a comment.
- A wizard that holds typed input sets `WizardFrame`'s `confirmDiscard`, so
  Close and Cancel ask "Discard changes" or "Keep editing". Dialogs with
  unsaved edits ask the same way.
- The router cannot hold in-app navigation, so a create wizard keeps its
  input as a draft (`useSessionDraft`, per person, in the tab's
  `sessionStorage`; never a secret or a token), shows `DraftRestoredAlert`
  when it comes back with one, and drops it on submit and in `WizardFrame`'s
  `onDiscard`. The new-agent wizard does; see `NewAgentFormProvider`.
- A link inside a form opens in a new tab and says so: `ExternalLink`.
- Hand-off naming contract (`MetaAgentBanner`):
  - "Let X help" opens a side chat and keeps the form; nothing is sent.
  - "Ask X …" opens New session with X preselected; nothing starts.
  - "<Verb> with X" ("Create with X", "Edit with X", "Evaluate with X") starts
    a session at once. Its strip says so, and the form's typed input travels
    in the first message, which the session page captions "Prepared by the
    portal".
- Never lose typed work. Links out of a form that is being filled open in a
  new tab.
- A page whose work in flight shows only on it (a tool's or a workflow's run)
  asks before the person leaves, saying whether the work goes on. Keep the
  work above the tabs where the page can (a tool's page keeps the run and
  the typed form with `useToolRun` and `useToolForm`), so only leaving the
  page asks; a page that keeps it in a tab (a workflow's Run it) holds its
  tabs too. The app's router has no blocker, so hold what can be held: the
  page's tabs through `ShellPage`'s `onTabNavigate`, plain clicks on links in
  the capture phase, and `beforeunload`. `useRunLeaveGuard` (muster
  `ToolDetail`) is the precedent. Back, the palette and navigation from code
  pass.
- A field that cannot change after creation is shown read-only, and the lock
  is stated once in a sentence ("Its technical name is `x`; it cannot be
  changed once the agent exists."). Do not use disabled fields or a "fixed"
  marker.

### The tools model (agent wizard)

- The access radio reads, in order: "Nothing outside the chat" (the default),
  the presets, then "Only the tools I choose below".
- A preset is a macro. Untouched, the toolset stays `[preset:x]` and follows
  the gateway, while the grid shows what it resolves to. The first change
  writes the resolution out as concrete selectors, applies the change and
  flips the radio to "Only the tools I choose below"
  (`NewAgentToolsPage/connectorChoice.ts`).
- Full gateway keeps the grid off, and own picks from it start empty.
- The 32-selector cap (`MAX_INLINE_SELECTORS`) mirrors a platform-wide limit
  in muster, the agent chart and agent-manager. Keep its error; do not lift
  it in Backstage alone.

### Skills

- The add and edit forms change `SKILL.md` only. Other files are listed
  read-only and open the Instructions viewer (`?file=`) in a new tab.
- Complex or multi-file skills go to the Skill Creator meta agent.
- Hide Edit and content when the portal cannot read the skill's source.

## 5. Scale and responsive

- Every list works at 3 entries and at 300. At about 3 there is no pagination
  chrome, no search, no filter bar and no zero-count option. At about 300 the
  list is windowed (`ShowMore`, a sliding window, or paging), searchable, and
  never an unbounded DOM. Test both fixtures.
- Choose the window idiom by the list. `ShowMore` pages through long lists;
  `revealAll` suits bounded excerpts; a sliding "Load more" window suits
  sessions; a rail-style cutoff ends with one link to the rest plus "N more"
  (the rail shows 8 recent sessions and 8 pins).
- 375px never regresses. There is no sideways page scroll; page content is
  343px wide; thumb targets are 44px.
- Use the breakpoints in `ui-react/src/utils/breakpoints.ts`
  (`usePhoneLayout`, `PHONE_MEDIA`, `TWO_COLUMN_MEDIA`, `TOUCH_MEDIA`).
  Components in slots of varying width measure their container instead. Test
  phone branches with `mockPhoneLayout()` at `PHONE_TEST_WIDTH`, both from
  `@giantswarm/backstage-plugin-ui-react/testUtils`.
- Under touch, hover-revealed controls are always visible and hints open on a
  press.
- Sticky footers and docks sit at
  `bottom: var(--agent-shell-mobile-bar-height, 0px)`, above the phone's
  bottom bar.

### bui quirks

- `truncate={false}` still truncates, because bui writes
  `data-truncate="false"`. Pass `undefined`.
- bui's `Table` clips instead of scrolling at phone width. The
  `agent-shell.css` fallback scrolls tables with four or more columns at 7rem
  each; it is a safety net, not a design.
- The tab underline is measured in screen coordinates. Never scroll bui's
  `TabList` yourself; `RouteTabs` owns the phone tab strip.
- react-aria draws tab strips one commit late, which matters for tests and
  observers.
- Form controls are 16px at phone width, set in `agent-shell.css`, to stop
  iOS from zooming on focus. Do not set them smaller.
- bui `Alert` has no `onClose`; use `customActions` with a tertiary small
  `ButtonIcon` labelled "Close".
- bui's single `Select` logs an "uncontrolled to controlled" warning under
  Jest. It is harmless.

## 6. Sanctioned exceptions

Every exception to a rule in this skill carries a code comment that names its
reason, usually on a named constant. `SOURCES_SEARCH_MIN` in
`NewAgentToolsPage/CopyFromAgent.tsx` and `AUTO_EXPAND_MAX` in
`ToolsetResolutionList` are the precedent. An exception without that comment
is a defect; one with it is not a finding. The kept list:

- Customize's main tabs always show search, because the catalogue is the front
  door.
- Search thresholds above `SEARCH_MIN` apply where a list auto-expands or pages
  at `INITIAL_ROWS`: CopyFromAgent, ServedModelsTable, ToolsetResolutionList
  (`AUTO_EXPAND_MAX`), NewAgentToolsPage and the capability lists.
- Zero-count filter options stay visible while typing, so options do not jump.
- Page sizes follow their geometry: Customize Agents shows 25 and Skills 24 per
  page; Usage by-agent pages while by-model reveals all; sessions use a "Load
  more" window.
- Agents and connectors draw an avatar or tile plus a bold name; models and
  workflows use stock `CellText`.
- The scope selectors (Usage 7 | 30 | 90, palette type chips) are direct
  selections.
- Confirm-delete and row-menu actions are dialogs.
- The session page's "Show tool activity" switch is the one page-wide view
  switch.
- Labels and column headers are noun phrases.
- Delete is for owned things and Remove for infrastructure.
- A read failure inside a finishable form is a warning.
- "Edit via agent" failure is inline danger text, because it sits in the
  header's action row.
- `AssistPanel`, the workflow full-screen layer and `DisabledAction` handle
  Escape themselves. The New session, palette and attachment dialogs close
  only from the header X, because they have nothing to cancel.
- The connector wizard's credentials group carries a third-level label; Home
  has a centred landing frame without a page header; the session crumb reads
  "Session".
- "Let X help" and "Create with X" differ because they are different actions.
- `formatCompactAge` (the rail's "16m") and lifecycle's elapsed `ago` are
  deliberate formats.

## 7. Process

- Follow CLAUDE.md's telemetry duties for every new route and write: a
  `getTelemetryPageViewPayload` case and a `knownTopLevelPaths` entry, and
  `useTrackedMutation` with a closed-set `portalEvents` entry.
- Add a changeset for user-facing changes in `plugins/*`, including
  `ui-react`.
- Run Jest on narrow paths with `--maxWorkers=2`; parallel agents on one dev
  host have starved each other. Rerun a timeout alone before you believe it.
- Repo-wide `yarn tsc`, `yarn lint:all` and full suites belong to integration;
  run `npx eslint` on the files you wrote.
- Update e2e specs that pin a string you changed. Shell specs run with
  `AGENTLAB_PORTAL_MODE=shell` in the `agentlab-shell` (1440×900) and
  `agentlab-mobile` (375×812, touch) projects, listed in
  `e2e/agentlab/portalModes.ts`. Use `exact: true` on locators, because
  Playwright matches names by substring.
- Verify a page change live at desktop width and at 375px before you call it
  done.

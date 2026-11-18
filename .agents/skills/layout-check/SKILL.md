---
name: layout-check
description: Measure portal pages for layout bugs in a headless browser of your own, against fixture mode — overflow and sideways scrolling, tables that scroll sideways in their card or squeeze a column beside columns with room to spare, overlapping elements, misaligned rows, text squeezed or cut off, controls that move or resize between states, and content off its control's centre — at several widths, in the fixture scenarios and the states a spec steps through. Use on every page your pull request changes, before asking for review, and to check a layout fix.
---

# Layout check

Unit tests don't see layout, and layout bugs only show on the rendered page:
a button running over its neighbour at 375px, a picker sitting between two
rows of filters after a longer value made them wrap. This check finds such
bugs by measuring the page: it opens each page in a browser of its own, so
runs in different checkouts never share one, and reads every control's,
icon's and line of text's box from the DOM. No screenshots.

The browser is Playwright's Chromium headless shell, what `chromium.launch()`
starts, as in the e2e suites (the agentlab suite on Linux with `unshare` and
`pasta` runs the full Chromium instead). The headless shell is on purpose:
the full Chromium renders on the GPU but was measured no faster (#3563).

| File | What it is |
|---|---|
| `layout-check.mjs` | The command. Exits 0 without findings, 1 with findings, 2 when it could not check (the portal does not answer, a step failed, a page kept changing, a path is a route template or shows a not-found page, a page threw and shows the error panel). Warnings never change the exit code. |
| `collect.mjs` | The measurement, run inside the page. |
| `rules.mjs` | The rules, pure functions over the measurement. |
| `rules.test.mjs` | Their tests: `node --test .agents/skills/layout-check/rules.test.mjs`. CI runs them (`.github/workflows/skill-tests.yaml`). |
| `layout-check.test.mjs` | Tests of the command that need no browser, run the same way. |
| `specs/agent-platform.mjs` | Every Agent Platform and muster page of the shell, with the states that broke before. |

Commands run from the repo root; `L=.agents/skills/layout-check`.

## Run it

Start fixture mode (`docs/fixtures.md`); the check reads the portal's URL
from `.fixtures-server.json` and stops with one message when the portal
does not answer. Stop the server when you are done.

```bash
L=.agents/skills/layout-check
yarn fixtures start
node $L/layout-check.mjs --page /customize/agents --page /usage/cost
node $L/layout-check.mjs --spec $L/specs/agent-platform.mjs --only Workspace
node $L/layout-check.mjs --spec $L/specs/agent-platform.mjs     # every page, about 12 minutes
yarn fixtures stop
```

- `--page` takes a concrete path, never a route template
  (`/sessions/:installation/:sessionId`, `/*`): the check refuses one, and
  any page that shows the portal's 404 page or a "… not found" heading,
  as could not check, and so is a page that threw and shows the portal's
  error panel ("Error in app"), after loading or after any state. For a
  page of one record, run the spec's entry for it (`--only`), which opens
  the first record in each scenario: a record's path exists only in the
  scenario it was copied from.
- `--widths 375,768,1024,1160,1280` (the default): a phone; a tablet or
  narrow window; a small laptop; a laptop window a little narrower than its
  screen; a laptop. Tables squeeze between the tablet and 1280: a column
  given less than its content while the others keep their minimums. Add the
  width where your layout changes (a breakpoint, a dialog's maximum).
- The side rail is pinned open at its default width (224px) from 600px up,
  on every page load, unless a step of the spec changed it: the content
  column is the width less the rail's (about 800px at 1024), which is the
  narrower case, where tables squeeze. Below 600px the rail is the bottom
  bar.
- `--scenarios base,many,long-names,empty,loading,error`: the fixture
  scenarios, each added to the URL as `?fixtures=<name>`. Without it the
  page loads with no parameter, which is `base`. What each scenario serves:
  `docs/fixtures.md`, "Scenarios".
- `--rules overlap,shift`: only some rules. `--ignore <css>` leaves a subtree
  out on every page, `--json` prints the findings as JSON, `--url` checks
  another portal (a dev server signed in as the guest), `--concurrency`
  sets how many pages load at once (3).

Warnings come after the findings, in a section of their own headed by
their count per scenario, and don't fail the check: a long name ending in
an ellipsis with no way to read the rest is worth a look, not a blocker.
Today the only warning is that one. `--json` gives `findings` and
`warnings` apart.

Every finding names the rule, the page, the width, the scenario and the
state, then the one or two elements with their role, name, a short path and
their box (`x y w×h`, CSS pixels in the viewport):

```
alignment: Agents (/customize/agents) @ 768px, scenario base, state "Sort: Last used"
  button "Sort agents" sits between two rows of the controls beside it (rows at y=-64 and y=-24)
    button "Sort agents" (div.bui-Flex > div.bui-Select > button.bui-SelectTrigger) at x=378 y=-44 147×32
    group "Filters" (div.bui-Flex > div.bui-Flex > div.bui-Flex) at x=77 y=-64 293×72
```

## When

On every page your pull request changes, before you ask for review: the
pages the `ui-impact` skill maps, at the default widths, in `base`, and in
the scenarios your change is about (a list: `many` and `long-names`; an
empty or failure state: `empty`, `error`, `loading`). If the page has a
state that changes its layout (a picker, a dialog, a tab, a filter), step
through it with a spec. Fix what it finds, or say in the pull request why a
finding is right as it is.

## The rules

- **overflow**: the page scrolls sideways, or a control or icon sticks out
  of the viewport where nothing scrolls to it.
- **overlap**: two controls, icons or lines of text of one layer overlap by
  4px or more each way, and neither is inside the other. An overlay (a
  dialog, popover, tooltip, menu, a fixed or sticky bar) is a layer of its
  own; something absolutely positioned (a badge on a button) may overlap
  its neighbours; a box inside another (an icon in a field) is no overlap.
- **alignment**: in a row of controls (a flex row whose children are rows of
  controls, not cards with text), a control sits between two rows of
  similar controls beside it, or lines up with none of its row's top,
  centre and bottom.
- **truncation**: text cut off by an element that hides its overflow
  (across, or a line or more down) without an ellipsis or line clamp; text
  squeezed to less than two em (a letter or two), with a tooltip or not; a
  control cut off by an ancestor that hides its overflow. Text that ends in
  an ellipsis (or a line clamp) is fine when its full value is there on
  hover (a `title`, `data-full-text`, or an `aria-describedby` naming a
  tooltip or a description holding the text, on
  it or up to three ancestors), and a **warning** when it isn't. A scroll
  container cuts nothing: a person scrolls to the rest. Text in a table is
  `table-fit`'s, not this rule's: with `--rules truncation` alone, text in
  tables is not checked.
- **table-fit**: all text in a table, typical content fitting its column
  (the `tables` skill, "Rule: typical content fits"). A table here has rows
  and column headers (`table`, `grid` or `treegrid` with a `columnheader`
  or a `th` in its `thead`); a tag group or a list without them is no table.
  Failing: a column header cut off (with an ellipsis or not, with a tooltip
  or not) or wrapped onto a second line; a short value cut off or wrapped.
  Cut off means cut by the cell or something in it, or spilling out of the
  cell over the next column; a table that scrolls sideways cuts nothing
  (the scrolling is `table-scroll`'s). A
  short value is a status label (in a badge or chip by its class,
  `role=status`, `data-status-label` as on ui-react's `StatusLabel`, or
  beside a `StatusDot`), or text of one of these shapes,
  at most 40 characters: a date or time, a duration or age, a number with
  or without a unit, a version, or a combination of them joined by `·`,
  `,` or `/` (`144 vCPUs · 1152 GiB`, `Nov 12, 2026, 14:03`, `about 2
  months ago`, `v1.29.4`, `0.4.1, 0.3.0`), in a link or a row header too.
  Everything else is free text (names, descriptions, IDs, URLs, paths),
  held to what `truncation` holds text to: cut off without an ellipsis or
  squeezed fails, an ellipsis with nothing on hover is a warning. A value
  laid out as several flex items in a row (`144 vCPUs`, `·`, `1152 GiB`) is
  measured as one when it wraps. One finding per table, column and kind,
  with the number of other rows it holds for. A column **squeezed** beside
  columns with room to spare fails too: in half or more of its rows its
  text is cut to less than six em and less than half of it, while the
  other columns leave at least 56px empty in every row, header included
  (16px or more each). The finding names the columns and the room each
  keeps. Text squeezed to no width at all counts, as cut to 0px.
- **table-scroll**: a table wider than the box that holds it, at a width
  where the page itself does not scroll sideways (that is `overflow`'s): it
  scrolls sideways inside its card, or is cut off by a box that hides its
  overflow. Typical content fits a table without scrolling (the `tables`
  skill). A table here has column headers, or a row of two or more cells.
  The finding names the table by its `aria-labelledby`, caption,
  `aria-label` (not bui's "Data table") or the last heading before it, its
  column headers, and how much of it is out of view. A table that scrolls
  sideways by design (a log view, a wide matrix to pan) says so with
  `data-layout-check="scroll-x"` on the table or an ancestor up to its scroll
  container; nothing else is left out. A code block or any other box that
  scrolls is not a table and not this rule's.
- **centering**: in a button, tab, select trigger, menu item, switch or link
  styled as a button (`role=button`, or bui's or MUI's button classes), the
  text and icons sit more than 2px off the centre of the
  content box, vertically always, horizontally where the control centres
  its content. The text's own box is compared, not its wrapper's;
  something absolutely positioned inside (a badge) is left out.
- **shift**: from one state to the next, a control outside lists, tables
  and overlays changes size, or moves sideways. Controls are matched by
  role, name and their place among the controls of that role and name. Moving down or up is not a
  finding: content above that loads or re-sorts moves what is below.

## Specs

A spec is a module whose default export is an array of pages:

```js
export default [
  {
    name: 'Agents',                 // in the report; defaults to the path
    path: '/customize/agents',
    widths: [375, 1100],           // instead of --widths, optional
    ignore: ['.some-chart'],       // subtrees to leave out, optional
    // Before the first measurement: open a record, a dialog.
    setup: async ({ page }) => { /* Playwright */ },
    // Measured in turn after 'initial'; `shift` compares each with the one before.
    states: [
      {
        name: 'Sort: Last used',
        run: async ({ page }) => {
          await page.locator('button[aria-label="Sort agents"]').click();
          await page.getByRole('option', { name: 'Last used' }).click();
        },
        shift: true,               // false: don't compare with the state before
      },
    ],
  },
];
```

The functions get `{ page, width, scenario, baseUrl, skip }`. `skip(reason)` leaves the rest of the page out when a scenario lacks what the spec steps through (no record to open in `empty`, no picker while `loading`); it's reported as skipped and doesn't change the exit code. The check waits after
each load, setup and state until the DOM has been quiet for 0.7 seconds
and finite animations are done, then measures. A page still changing after
20 seconds is not measured: it is reported as could not check, with the
state it was in (`load`, `setup` or the state's name), and the run exits 2. Find
records through the page (its first link or row), not by fixed ids, so a
spec runs in every scenario. `data-layout-check="ignore"` on an element
leaves its subtree out too, for a widget whose layout is not the portal's;
`data-layout-check="scroll-x"` only says a table scrolls sideways by design
(`table-scroll`).

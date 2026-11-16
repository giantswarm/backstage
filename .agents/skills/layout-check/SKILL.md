---
name: layout-check
description: Measure portal pages for layout bugs in a headless browser of your own, against fixture mode — overflow and sideways scrolling, overlapping elements, misaligned rows, text squeezed or cut off, controls that move or resize between states, and content off its control's centre — at several widths, in the fixture scenarios and the states a spec steps through. Use on every page your pull request changes, before asking for review, and to check a layout fix.
---

# Layout check

Unit tests don't see layout, and layout bugs only show on the rendered page:
a button running over its neighbour at 375px, a picker sitting between two
rows of filters after a longer value made them wrap. This check finds such
bugs by measuring the page: it opens each page in a headless Chromium of its
own (Playwright's, the one the e2e suite uses), so runs in different
checkouts never share a browser, and reads every control's, icon's and line
of text's box from the DOM. No screenshots.

| File | What it is |
|---|---|
| `layout-check.mjs` | The command. Exits 0 without findings, 1 with findings, 2 when it could not check (the portal does not answer, a step failed, a page kept changing). Warnings never change the exit code. |
| `collect.mjs` | The measurement, run inside the page. |
| `rules.mjs` | The rules, pure functions over the measurement. |
| `rules.test.mjs` | Their tests: `node --test .agents/skills/layout-check/rules.test.mjs`. CI runs them (`.github/workflows/skill-tests.yaml`). |
| `specs/agent-platform.mjs` | Every Agent Platform and muster page of the shell, with the states that broke before. |

Commands run from the repo root; `L=.agents/skills/layout-check`.

## Run it

Start fixture mode (`docs/fixtures.md`); the check reads the portal's URL
from `.fixtures-server.json` and stops with one message when the portal
does not answer. Stop the server when you are done.

```bash
yarn fixtures start
node $L/layout-check.mjs --page /customize/agents --page /usage/cost
node $L/layout-check.mjs --spec $L/specs/agent-platform.mjs --only Workspace
node $L/layout-check.mjs --spec $L/specs/agent-platform.mjs     # every page, about 7 minutes
yarn fixtures stop
```

- `--widths 375,768,1280` (the default): a phone, a tablet or narrow window
  with the side rail, a laptop. Add the width where your layout changes
  (a breakpoint, a dialog's maximum).
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
  hover (a `title`, a tooltip by `aria-describedby`, or `data-full-text`, on
  it or up to three ancestors), and a **warning** when it isn't. A scroll
  container cuts nothing: a person scrolls to the rest.
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
leaves its subtree out too, for a widget whose layout is not the portal's.

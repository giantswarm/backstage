---
name: mockups
description: Build or review UI from a mockup — a Claude Design canvas, an artboard, a `.dc.html` file, or a mockup in Miro, Figma or a screenshot — so the page follows the mockup's layout, grouping, sizes and emphasis, not only its text. Read the relevant artboards in full with their styles, write an inventory before any code, map styling to tokens, check the page against the inventory, and list every deviation in the pull request. Use whenever a task, issue, brief or pull request names a mockup, a design canvas, an artboard or a `.dc.html` file, or asks to build or implement a page from a design.
---

# Building UI from a mockup

A mockup is a spec of layout and visual design, not a list of strings. The
failure this skill prevents: an agent stripped the artboard's `style="…"`
attributes before reading it, kept the copy and the field names, and built a
page with none of the design's layout, grouping, sizes or emphasis. Nothing
noticed. Every step below exists so that cannot happen silently.

The repo's own rules still apply: the [`ui`](../ui/SKILL.md),
[`agent-platform-ux-coding`](../agent-platform-ux-coding/SKILL.md),
[`tables`](../tables/SKILL.md), [`forms`](../forms/SKILL.md) and
[`urls`](../urls/SKILL.md) skills. Where they conflict with the mockup, they
win, and the conflict is a deviation you list (step 5).

## Where the mockup is

The link to a mockup lives in the issue or the brief, whose tracker is
private, never in this public repo: take it from there. The pull request
references that issue, which is how a reviewer finds the mockup. No claude.ai,
Miro or Figma links in code, docs or pull requests here.

## The format: Claude Design canvases

Mockups for this repo are mostly Claude Design canvases: claude.ai artifacts
of type "Design". A canvas holds:

| File | What it is |
|---|---|
| `project/canvas.json` | The index: artboard names, sizes, order, notes. |
| `project/<Name>.dc.html` | One artboard, self-contained. |

In a `.dc.html` file:

- **Inline `style="…"` attributes carry the layout and the visual design**:
  widths, flex and grid, gaps, padding, type sizes and weights, colours. That
  is the format's convention, because the canvas editor edits inline styles.
  Strip them and the design is gone.
- `<helmet><style>` holds the page basics (fonts, background, resets).
- `<dc-import name="X">` pulls in another artboard, `project/X.dc.html`, such
  as a shared rail. It is part of the design.
- `<sc-for>` repeats, `<sc-if>` branches; the script block's `renderVals()`
  fills the `{{…}}` values. The sample data and the states are there.

The source is the spec. You don't need to render it in a browser to read it.

## 1. Read

For a canvas:

1. List the canvas's files: the Artifact tool, action `list`, scope `files`,
   with the canvas's `url`.
2. Read `project/canvas.json` (action `read`, `path: "project/canvas.json"`).
   Pick the artboards the task is about; note their widths and notes.
3. Fetch each of those artboards (action `read`, `path:
   "project/<Name>.dc.html"`), then every artboard it `<dc-import>`s, and
   theirs, until nothing is left.
4. The read saves each file locally. Read each saved file once, in full,
   with the Read tool (in parts if it is long, but every part).

Never strip, filter or summarise the source before you have worked through
it: no `sed`, `grep`, regex or script that drops attributes, tags or
`<style>`, no "text only" extraction, no subagent summary in place of your own
reading. Searching a file you have already read in full, to find a spot again,
is fine.

Another kind of mockup (a Miro board, a Figma frame, a screenshot): read what
is there as fully as the medium allows (every frame, its sizes, colours and
annotations), then follow steps 2 to 6 the same way.

A mockup you can't read at all (no access, a canvas file missing, an import
that doesn't resolve): say so, name what is missing, and stop before you
build any UI. Don't build from the text of the task in its place.

## 2. Inventory, before any code

Write it from the source, per artboard:

- **Regions**, in order, top to bottom and left to right, each with its
  layout: flex or grid, direction, widths and columns, gaps, alignment, what
  wraps or scrolls.
- **Per region**, every label, value, action and state, each with its type
  size, weight, colour and emphasis (primary, secondary, muted, danger), and
  how it is grouped with its neighbours.
- **Sample data**: its shape (fields, types, how many rows), from
  `renderVals()` and the `<sc-for>` loops; every `<sc-if>` branch is a state
  the page has (empty, loading, error, a role, a flag).
- **Mapping**, for each item: the bui or `ui-react` component it becomes, and
  the token of the area the page lives in: the shell's
  (`packages/app/src/modules/agentShell/agent-shell.css`, `theme.ts`) for an
  Agent Platform page, bui's for the rest. A literal hex or px value maps to
  the nearest token or the component's default; write down where none fits.

A table per region works well:

| Item | Mockup (source) | Component | Token / prop |
|---|---|---|---|
| Title | 20px, 600, `#1a1a1a` | `ShellPage` title | default |
| Status | 12px, green dot + text | `StatusLabel` (`ui-react`) | `intent="positive"` |
| "Last run" | 13px, `#6b6b6b` | bui `Text` | `variant="body-small"`, `color="secondary"` |

When a supervisor or a person asked to see it, the inventory goes into your
first reply, before code. A short form of it (regions and their mapping) goes
into your final reply or the pull request description.

## 3. Build

- Match the mockup's structure, order, hierarchy and emphasis exactly: the
  same regions in the same order, the same grouping, the same things big,
  bold, muted or primary.
- Map styling to tokens and components, as the inventory says. Don't copy
  literal hex or px values into the code.
- The sample data shows what the page displays; the fixtures must serve it
  (`docs/fixtures.md`, "The data set"), each `<sc-if>` state included where
  the page can reach it.
- Where a repo rule conflicts with the mockup, follow the rule and add the
  conflict to the differences (step 5).

## 4. Check

After building, go through the inventory item by item against the page in
fixture mode (`docs/fixtures.md`), in the DOM: rendered text, order, roles,
computed font size, weight and colour, the boxes' widths and gaps. Read them
with the repo's Playwright (`getComputedStyle`), or with the chrome-devtools
MCP only under the limits AGENTS.md sets ("Fixture mode and the layout
check": `--isolated` or a `--userDataDir` of your checkout).

Do it at the artboard's width and at the
[`layout-check`](../layout-check/SKILL.md) widths, and run the layout check in
`base` and the scenarios of the states the mockup shows. Add the artboard's
width to `--widths` only when it isn't one of the defaults (375, 768, 1024,
1160, 1280):

```bash
L=.agents/skills/layout-check
node $L/layout-check.mjs --widths 375,768,1024,1160,1280,1440 \
  --scenarios base,empty,loading,error --page /customize/agents
# a page with parameters: the spec's entry for it
node $L/layout-check.mjs --widths 375,768,1024,1160,1280,1440 \
  --scenarios base,empty,loading,error \
  --spec $L/specs/agent-platform.mjs --only Workspace
```

Every item ends as matching, or as a row in the differences table. None is
skipped.

## 5. Pull request

Fill in the template as usual, and add a `### Differences from the mockup`
section to the description after the template's description part (Rationale,
Changes, Effect on end users): every place the page deviates, and why. Don't
change the template.

```markdown
### Differences from the mockup

Mockup: linked from #1234, artboards `Agents.dc.html`, `Rail.dc.html`.

| Mockup | Page | Reason |
|---|---|---|
| "Cost this month" column | Not shown | No data source yet |
| Title 24px | 20px `ShellPage` title | Shell rule: every page uses `ShellPage` |
| Bulk delete | Not built | Out of scope, follow-up issue |
```

Reasons are concrete: no data source yet, a repo rule (name it), out of scope
(say where it goes). Nothing is left out silently; "None" is an answer only
when the check found no difference. Reference the issue that links the
mockup and name the artboards by file name; no link to the mockup itself.

## 6. Review

A review of a pull request built from a mockup takes the mockup from the
issue the pull request references, reads the same artboards the same way
(step 1), and checks the pull request against them and against its
differences table: a difference missing from the table is a finding, and so
is a reason that doesn't hold.

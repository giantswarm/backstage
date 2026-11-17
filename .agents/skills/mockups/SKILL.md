---
name: mockups
description: Build or review UI from a design mockup — a Claude Design canvas, an artboard, a `.dc.html` file — so the page follows the design's layout, grouping, sizes and emphasis, not only its text. Read every artboard in full with its styles, write an inventory before any code, map styling to bui and shell tokens, check the page against the inventory, and list every deviation in the pull request. Use whenever a task, issue, brief or pull request names a mockup, design, canvas, artboard or `.dc.html` file.
---

# Building UI from a mockup

A mockup is a spec of layout and visual design, not a list of strings. The
failure this skill prevents: an agent stripped the artboard's `style="…"`
attributes before reading it, kept the copy and the field names, and built a
page with none of the design's layout, grouping, sizes or emphasis. Nothing
noticed. Every step below exists so that cannot happen silently.

The shell's own rules still apply: the [`ui`](../ui/SKILL.md),
[`agent-platform-ux-coding`](../agent-platform-ux-coding/SKILL.md),
[`tables`](../tables/SKILL.md), [`forms`](../forms/SKILL.md) and
[`urls`](../urls/SKILL.md) skills. Where they conflict with the mockup, they
win, and the conflict is a deviation you list (step 5).

## The format

Mockups for this repo live on Claude Design canvases: claude.ai artifacts of
type "Design". A canvas holds:

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

1. List the canvas's files: the Artifact tool, action `list`, scope `files`,
   with the canvas's `url`.
2. Read `project/canvas.json` (action `read`, `path: "project/canvas.json"`).
   Pick the artboards the task is about; note their widths and notes.
3. Read each of those artboards (action `read`, `path:
   "project/<Name>.dc.html"`), then every artboard it `<dc-import>`s, and
   theirs, until nothing is left.
4. Open each saved file with the Read tool, in full (in parts if it is long,
   but every part).

Never strip, filter or summarise the source before you have worked through
it: no `sed`, `grep`, regex or script that drops attributes, tags or
`<style>`, no "text only" extraction, no subagent summary in place of your own
reading. Searching a file you have already read in full, to find a spot again,
is fine.

A canvas you can't read (no access, a file missing, an import that doesn't
resolve): say so, name what is missing, and stop before you build any UI.
Don't build from the text of a task, an issue or a screenshot in its place.

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
  the token it uses (`packages/app/src/modules/agentShell/agent-shell.css`,
  `theme.ts`, bui's own tokens). A literal hex or px value maps to the nearest
  token or the component's default; write down where none fits.

A table per region works well:

| Item | Mockup (source) | Component | Token / prop |
|---|---|---|---|
| Title | 20px, 600, `#1a1a1a` | `ShellPage` title | default |
| Status | 12px, green dot + text | `StatusLabel` (`ui-react`) | `intent="positive"` |
| "Last run" | 13px, `#6b6b6b` | bui `Text` | `variant="body-small"`, `color="secondary"` |

When a supervisor or a person asked to see it, the inventory goes into your
first reply, before code. It always goes into the pull request description,
in short form (step 5).

## 3. Build

- Match the mockup's structure, order, hierarchy and emphasis exactly: the
  same regions in the same order, the same grouping, the same things big,
  bold, muted or primary.
- Map styling to tokens and components, as the inventory says. Don't copy
  literal hex or px values into the code.
- The sample data shows what the page displays; the fixtures must serve it
  (`docs/fixtures.md`, "The data set"), each `<sc-if>` state included where
  the page can reach it.
- Where a shell rule conflicts with the mockup, follow the rule and add the
  conflict to the differences (step 5).

## 4. Check

After building, go through the inventory item by item against the page in
fixture mode (`docs/fixtures.md`), in the DOM: rendered text, order, roles,
computed font size, weight and colour, the boxes' widths and gaps. Do it at
the artboard's width and at the [`layout-check`](../layout-check/SKILL.md)
widths, and run the layout check with the artboard's width added:

```bash
node .agents/skills/layout-check/layout-check.mjs \
  --widths <artboard width>,375,768,1280 --page <path>
```

Every item ends as matching, or as a row in the differences table. None is
skipped.

## 5. Pull request

The description carries the inventory in short form (regions and their
mapping) and a "Differences from the mockup" section with a table: every
place the page deviates, and why.

```markdown
### Differences from the mockup

Mockup: canvas "<canvas title>", artboards `Agents.dc.html`, `Rail.dc.html`.

| Mockup | Page | Reason |
|---|---|---|
| "Cost this month" column | Not shown | No data source yet |
| Title 24px | 20px `ShellPage` title | Shell rule: every page uses `ShellPage` |
| Bulk delete | Not built | Out of scope, follow-up issue |
```

Reasons are concrete: no data source yet, a shell rule (name it), out of
scope (say where it goes). Nothing is left out silently; "None" is an answer
only when the check found no difference. Name the canvas by its title and the
artboards by file name. This repo is public: no claude.ai links to a canvas.

## 6. Review

A review of a pull request built from a mockup reads the same artboard files,
the same way (step 1), and checks the pull request against them and against
its differences table: a difference missing from the table is a finding, and
so is a reason that doesn't hold.

---
name: ui-sitemap
description: Maintain the visual sitemap of the Agent Platform UI on its Miro board — screenshots of every page, tab, wizard step and dialog, laid out as a tree. Use when asked to add or refresh pages on the map, capture a dialog or wizard step for it, or rebuild the map, and when a change adds, moves or removes a page of the agent shell and the map should follow.
---

# Agent Platform sitemap on Miro

The map is a top-down tree of screenshots: one card per page, a group box per
page with tabs or a wizard, dialogs and states beside their page. This
directory holds everything a run needs; the board holds only the result.

| File | What it is |
|---|---|
| `sitemap.tsv` | The nodes, hand-written. Row order is sibling order. |
| `sitemap.state.tsv` | What is on the board: one row per drawn node, with its Miro item ids. Written by runs only; committed, so the next run knows. |
| `layout.mjs` | Turns both TSVs and the screenshots into a plan: the position and size of every item. The drawing rules' one implementation. |
| `layout.test.mjs` | Its tests: `node --test .claude/skills/ui-sitemap/layout.test.mjs` |
| `screens/` | The screenshots, `<id>.png`. Gitignored: they can show data. |
| `recipes/<id>.md` | A long `reach` recipe, when a cell is not enough (none yet). |

**Board**: <https://miro.com/app/board/uXjVEXNCTFU=/> ("Agent Platform map
(test)"). Its third test layout was drawn by hand before this skill existed,
so `sitemap.state.tsv` does not list it: the first run either builds beside
it (`--origin`) or asks once to delete it.

Paths follow the [`urls`](../urls/SKILL.md) skill's tree: take a new node's
path from there, or from the router, never from memory.

## Run order

Commands run from the repo root; `S=.claude/skills/ui-sitemap`.

1. **Read** `sitemap.tsv` and `sitemap.state.tsv`. Run
   `node $S/layout.mjs --no-screens --out $S/screens/before.json` — the
   board as the state says it is.
2. **Decide** what to capture: nodes with no state row (new), nodes whose
   `commit` is older than a change to their page (`git log <commit>..HEAD --
   <the page's component>`), and what the person asked for. A state row
   whose node is gone shows in the plan's `removed`. Say what you will
   capture, replace and remove before you start.
3. **Capture** each one to `screens/<id>.png` ([Capture](#capture)).
4. **Lay out**:
   `node $S/layout.mjs --previous $S/screens/before.json --out $S/screens/plan.json`.
   Its `changes` lists the item keys added, moved, changed (text, file,
   style) and removed against step 1.
5. **Apply** the plan to Miro ([Miro](#miro)): create what is added, update
   what moved or changed, delete what is removed — after one confirmation
   for all the deletes of the run.
6. **Write back** `sitemap.state.tsv` (one row per drawn node, ids from the
   Miro results) and commit it with any `sitemap.tsv` change, in a PR.

## Capture

With the chrome-devtools MCP, against a signed-in dev server
(`https://localhost:3000`) or [agentlab](https://github.com/giantswarm/agentlab):

- Open your own tab (`new_page`) and close it when done; never touch other
  tabs.
- 2× resolution at 1440 CSS px wide: `emulate` with viewport `1440x900x2`.
- Navigate inside the app, not by reloading (`navigate_page` reloads the
  whole app and is much slower):
  `history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate'))`.
- Wait until loaded: the body text length is stable for ~2 s, and there is
  no "Reading …" or "Loading…" text, no `aria-busy="true"` and no skeleton.
  On a detail page also wait for the `h1`.
- Tall pages: read `document.documentElement.scrollHeight`, set the viewport
  height to it (cap 2400), wait ~2 s, screenshot the viewport, and reset to
  900. Chat-like pages with a docked composer (a session) stay at 900; their
  `note` says so.
- `take_screenshot` with `filePath` writes only inside the MCP's workspace
  roots (the working directory), not `/tmp` — `screens/` is inside.
- Follow `reach`: empty means open `path`; otherwise it names a concrete
  example (`row "Kubernetes"`) and/or steps (`click "New agent" > fill
  Name=demo > click Continue`).
- **Never submit a form or run an action.** Dialogs and wizard steps are
  opened and filled only as far as the state needs; `note` says what not to
  press. Close a dialog with Escape afterwards.
- **Privacy**: a screenshot can show agent names or descriptions that look
  like a real customer's. Prefer demo data or agentlab; skip a page you can't
  show clean and say so.
- Record per node: the date, `git rev-parse --short HEAD` of the code you
  captured, and the viewport (`1440x2400x2`).

## Miro

With the claude.ai Miro MCP. Don't create or share a board without the
person's OK.

- **Cards, group boxes, labels, the title, level markers and lines**:
  `canvas_create_from_svg` / `canvas_update_from_svg` in the Canvas Composer
  DSL. Load `canvas_get_canvas_composer_skill` first (steps `design` and
  `dsl`; the `dsl` output is large, load it once per run).
- **Lines attach to cards and group boxes**, not to images: connectors don't
  attach reliably to separately created images. That is why every
  screenshot sits on a card.
- **Images last**, so they sit on top of their cards:
  1. `image_get_upload_url` (`content_type: image/png`, a title, the plan's
     `width`, `cx`, `cy`).
  2. Within 10 minutes:
     `curl -X PUT -H 'Content-Type: image/png' --data-binary @<file> '<upload_url>'`,
     with the plan's `file`.
  3. `image_create` with the token, at the plan's `cx`/`cy` — the image's
     **centre**, unlike every other item's top-left `x`/`y`. Upload the full
     2× file; only the placed width is smaller.
- **Text**: never `<` or `>` in a label (parsed as a tag and dropped); use
  `:installation`-style placeholders. Each label box is as wide as its
  screenshot (the plan's `width`), so it doesn't wrap.
- **Deleting needs the person's explicit confirmation** (the Miro tools'
  rule). Replacing a screenshot is a new image plus deleting the old one, so
  collect the run's replacements and removals and ask once.

## Drawing rules

`layout.mjs` implements these; change both together.

- A top-down tree: one row per level, top-aligned, each child centred under
  its parent (pushed right where siblings' subtrees would overlap). "Level n"
  at the left of each row; a large title and a one-line subtitle on top.
- Placed screenshot width by level: 0 → 1440, 1 → 960, 2 → 720, 3 and
  deeper → 540; the height follows the image. Name (bold) / path (regular,
  grey) font sizes: 64/32, 44/22, 32/16, 24/12. Card padding: 48, 32, 24, 18.
- `page`: a card (faint blue `#f0f5fd`, rounded) with the name, the path and
  the screenshot.
- `tabs`: a group box (faint grey `#f7f7f7`, thin `#e7e7e7` border, the page
  name once at the top) with a card per `tab` inside, side by side in
  sitemap order, at the page's level size. No lines between tabs; the parent
  connects to the group box; a tab's children connect from its tab card.
- `wizard`: a group box like `tabs`, with a card per `step` and straight
  arrows from each step to the next, because they are a sequence.
- `dialog`: a card at its page's size, beside the page in the same row,
  joined by a straight dashed line labelled "Dialog".
- `state` (empty, error, …): a card one level smaller, faint amber
  `#fff8e6`, beside its page, joined by a dashed line labelled "State".
- Lines between levels: elbowed, `#313131`, width 4, arrow at the child, from
  the bottom of the parent to the top of the child.

## sitemap.tsv

Tab-separated, one header row, one row per node; no tabs or newlines inside
a cell. Trailing empty cells may be left off.

```
id	parent	kind	name	path	reach	note
```

- `id`: stable, lowercase kebab-case; the screenshot's file name and the
  state's key. Don't rename one that is on the board — that is a remove and
  an add.
- `parent`: the parent's id; one root (Home) has none.
- `kind`: `page`, `tabs` (its children are `tab`s), `tab`, `wizard` (its
  children are `step`s), `step`, `dialog`, `state`. A `tab` or `step` sits
  under its group; a `dialog` or `state` under the page, tab or step it
  belongs to; `layout.mjs` rejects anything else.
- `path`: the route template, with `:installation`-style placeholders. A
  dialog or state has its page's path; a default tab its page's bare path.
- `reach`: empty, or how to get there (see [Capture](#capture)); a long one
  points to `recipes/<id>.md`.
- `note`: free text — what never to press, when the page has the tab, a
  fixed viewport.

## sitemap.state.tsv

```
id	captured	commit	viewport	card	image	label	edge
```

One row per node on the board: the capture date (`2026-10-21`), the short
commit captured, the viewport (`1440x2400x2`), and the Miro ids of its card
(or group box), image, labels (name and path, comma-separated) and incoming
line. Rows whose `id` starts with `_` are the board's own items (`_title`,
`_subtitle`, `_level-0`, …), with the id in `label`. Written only by a run,
after the items exist, in sitemap row order. A node's `viewport` is what
`layout.mjs` sizes it by when its PNG is not in `screens/`, so the board's
layout can be recomputed on any machine.

## The plan

`layout.mjs` prints JSON (`--out` writes it to a file):

- `items`, in draw order (boxes and labels, lines, images), each with a
  stable `key` (`<id>/card|name|path|image|edge`, `_title`, `_level-1`),
  its `node`, `type` (`card`, `group`, `text`, `line`, `image`), the
  geometry, the style, the state column its Miro id goes in (`stateColumn`)
  and that id if the state has one (`miroId`). Lines name the item keys they
  join (`from`, `to`, `fromSide`, `toSide`) and carry their `points`. Images
  carry `file` (null when there is no new screenshot), `source` (`png`,
  `state`, `default`) and `cx`/`cy`.
- `nodes`: each node's kind, level, reach, note and capture state.
- `removed`: state rows whose node is no longer in the sitemap.
- `changes` (with `--previous`): item keys `added`, `moved`, `changed`,
  `removed`.

The same input always gives the same plan. Options: `--screens dir`,
`--no-screens`, `--sitemap`, `--state`, `--origin x,y` (where the tree's
top-left corner goes on the board); `--help` lists them.

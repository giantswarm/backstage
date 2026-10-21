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
| `sitemap.state.tsv` | What is on the board: one row per drawn node, with its Miro item ids. Written by runs only (`layout.mjs --write-state`); committed, so the next run knows. |
| `layout.mjs` | Turns both TSVs and the screenshots into a plan: the position and size of every item. The drawing rules' one implementation. Also writes the plan as Miro SVG, the list of images to upload, and the state after a run. |
| `layout.test.mjs` | Its tests: `node --test .claude/skills/ui-sitemap/layout.test.mjs` |
| `screens/` | The screenshots, `<id>.png`, and the run's scratch files. Gitignored: they show real data. |
| `recipes/<id>.md` | A long `reach` recipe, when a cell is not enough (none yet). |

**Board**: <https://miro.com/app/board/uXjVEXNCTFU=/> ("Agent Platform map
(test)"). Its third test layout was drawn by hand before this skill existed,
so `sitemap.state.tsv` does not list it: the first run either builds beside
it (`--origin`) or asks once to delete it.

Paths follow the [`urls`](../urls/SKILL.md) skill's tree: take a new node's
path from there, or from the router, never from memory.

**Keep the sitemap complete.** A run captures only the nodes `sitemap.tsv`
lists, and the map is only as complete as that file. It lists every shell
page, tab, wizard and the dialogs worth showing as of this skill's last
change; edit pages are one node each (the create wizard's steps, filled in).
Before a run, compare it with the `urls` skill's tree and with the shell's
cases in `getTelemetryPageViewPayload` (`packages/app/src/utils/telemetry.ts`),
which names every routed page and tab; add a row for anything missing.

## Customer data

The board is private, and screenshots show whatever the installation holds,
customer names included. Capture every page as it is; don't skip, crop or
pick around customer data. In return:

- **Nothing customer-specific goes into the repo**: not in `sitemap.tsv`
  (`reach` examples and notes stay neutral: "the first row", a connector
  every installation has), not in `sitemap.state.tsv`, this file, commits or
  pull requests. Screenshots stay in the gitignored `screens/`.
- **Never share or publish the board**: don't change its sharing settings,
  invite anyone or make it public, and don't post screenshots anywhere
  public (pull requests included). Its link is fine; only the board's
  members can open it.

## Run order

Commands run from the repo root; `S=.claude/skills/ui-sitemap`. The state
records the origin the board was drawn at, and `layout.mjs` uses it unless
`--origin` moves the drawing.

1. **Read** `sitemap.tsv` and `sitemap.state.tsv`, and check the sitemap
   is complete (above). Remove the last run's scratch files first:
   `rm -f $S/screens/images.tsv $S/screens/skipped.tsv $S/screens/result*.svg`
   — `screens/` outlives a run, and an old line there would give this run's
   state another run's ids.
2. **Decide** what to capture: nodes without an image in the state (new),
   nodes with a `skipped` reason (try again), nodes whose `commit` is older
   than a change to their page (`git log <commit>..HEAD -- <the page's
   component>`), and what the person asked for. Say what you will capture
   before you start.
3. **Capture** each one to `$S/screens/<id>.png` ([Capture](#capture)).
   Write down each node you can't capture, with why, in
   `$S/screens/skipped.tsv` (a header line `id<TAB>reason`, then one row per
   node).
4. **Lay out**:
   `node $S/layout.mjs --out $S/screens/plan.json --svg $S/screens/board.svg --uploads $S/screens/uploads.tsv`.
   The plan's `changes` says what to do to the board ([The plan](#the-plan)):
   which items to create, update and replace, and which Miro ids to delete.
   `board.svg` is those creates and updates as one Canvas Composer document;
   `uploads.tsv` lists the screenshots to upload.
5. **Apply** the plan to Miro ([Miro](#miro)): `board.svg` first (cards,
   group boxes, labels, lines), then the images. Save each result SVG as
   `$S/screens/result*.svg` and write each image's Miro id to
   `$S/screens/images.tsv` (a header line `node<TAB>miroId`, then one row
   per image).
   Ask once for all the run's deletes, listing them, and delete only after a
   yes.
6. **Write back** the state:
   `node $S/layout.mjs --write-state --result $(ls $S/screens/result*.svg | paste -sd,) --images $S/screens/images.tsv --skipped $S/screens/skipped.tsv --commit <sha>`
   (a missing file counts as empty). `--commit` names the code the new
   screenshots show: `main`'s commit the dev server runs, or the one the
   agentlab image was built from — never a branch commit, which a squash
   merge removes from history. It recomputes the plan from the same inputs
   and writes one row per drawn node, with the Miro ids of the items this
   run created, the new screenshots' ids, capture times (the PNG's
   modification time, rounded up to the second), commit and viewports, and
   the drawing (`_layout`). It refuses an image id for a node with no new
   screenshot, or one the plan deletes: a line left from an earlier run. A
   replaced screenshot whose new image wasn't uploaded keeps its old one, on
   the board and in the state, and the next run replaces it again. Run it
   after the deletes: it drops the ids the plan deletes and lists the ones
   still to delete. Then run step 4 once more; its `changes` must be empty.
   Commit the state with any `sitemap.tsv` change, in a PR. Which sitemap
   the board was drawn from: while the state is committed, the commit's;
   after `--write-state`, the current `sitemap.tsv`. If you edit
   `sitemap.tsv` again before committing the state, keep a copy of it as it
   was at `--write-state` and pass it as `--board-sitemap`.

## Capture

With the chrome-devtools MCP, against a signed-in dev server
(`https://localhost:3000`) or [agentlab](https://github.com/giantswarm/agentlab):

- Open your own tab (`new_page`) and close it when done; never touch other
  tabs. `new_page` can time out while the tab still opens: check
  `list_pages` for the new page's id before you retry.
- 2× resolution at 1440 CSS px wide: `emulate` with viewport `1440x900x2`.
- Navigate inside the app, not by reloading (`navigate_page` reloads the
  whole app and is much slower):
  `history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate'))`.
- Wait until loaded: the body text length is stable for ~2 s, no line
  matches `^(Reading|Loading)\b.*(…|\.\.\.)$` ("Reading this agent's
  usage…"), and there is no `aria-busy="true"`, `role="progressbar"` or
  skeleton. On a detail page also wait for the `h1`. A skeleton that stays
  more than ~30 s is usually a placeholder ("Pick a cluster to see …"): read
  the text around it and capture if so.
- **Dismiss toasts before every screenshot**: notifications and sign-in
  reminders ("… need your attention", "… need your sign-in") appear as
  `role="alertdialog"` or `role="alert"` pop-ups over the page, at any time.
  Click their close button, then check that none is left.
- Tall pages: read `document.documentElement.scrollHeight`, set the viewport
  height to it (cap 2400), wait ~2 s, dismiss toasts, screenshot the
  viewport, and reset to 900. Chat-like pages with a docked composer (a
  session) stay at 900; their `note` says so. Dialogs are captured at 900,
  over their page.
- `take_screenshot` with `filePath` writes only inside the MCP's workspace
  roots (the working directory), not `/tmp` — `screens/` is inside.
- Follow `reach`: empty means open `path`; otherwise it names a concrete
  example (`row "Kubernetes"`) and/or steps (`click "New agent" > fill
  Name=demo > click Continue`). Steps that don't start with `open` start on
  the parent's page. When the example doesn't exist on the installation,
  pick the nearest one and say so.
- **Never submit a form or run an action.** Dialogs and wizard steps are
  opened and filled only as far as the state needs; `note` says what not to
  press. Close a dialog with Escape afterwards.
- A node that can't be reached here (the state needs a write, the
  installation has nothing to show): skip it and record why in
  `screens/skipped.tsv`; `--write-state` keeps the reason in the state's
  `skipped` column until the node has a screenshot. Keep the reason neutral.
- `--write-state` records each new screenshot's capture time and viewport
  from the PNG; nothing to note by hand. A PNG counts as new only while it
  is newer than the state's `captured`, so screenshots left over from an
  earlier run are not uploaded again.

## Miro

With the claude.ai Miro MCP. Don't create or share a board without the
person's OK.

- **Cards, group boxes, labels, the title, level markers and lines**:
  `canvas_create_from_svg` (first build) / `canvas_update_from_svg` (later
  runs) with `screens/board.svg`. Load `canvas_get_canvas_composer_skill`
  first (steps `design` and `dsl`; the `dsl` output is large, load it once
  per run). `canvas_create_from_svg` may move a composition to avoid
  existing content: check the result's coordinates against the plan.
- Every element's local `id` is its plan key (`k_home_card` for
  `home/card`). A line to a card already on the board joins a stub,
  `<rect id="k_home_card" data-miro-id="…" />`, which changes nothing;
  `board.svg` adds them.
- **Lines attach to cards and group boxes**, not to images: connectors don't
  attach reliably to separately created images. That is why every
  screenshot sits on a card.
- **Images last**, so they sit on top of their cards; `uploads.tsv` has a
  row per image (`node`, `file`, `title`, `width`, `cx`, `cy`):
  1. `image_get_upload_url` (`content_type: image/png`, the row's title,
     width, cx, cy). Ask for 8–10 in one turn, in parallel.
  2. Within 10 minutes, one shell call for the batch, a
     `curl -X PUT -H 'Content-Type: image/png' --data-binary @<file> '<upload_url>'`
     per image, printing each status.
  3. `image_create` with each token, in parallel. The position comes from
     the token: `cx`/`cy`, the image's **centre**, unlike every other item's
     top-left `x`/`y`. Upload the full 2× file; only the placed width is
     smaller. Append `node<TAB>item_id` to `screens/images.tsv`.
- **Text**: never `<` or `>` in a label (parsed as a tag and dropped); use
  `:installation`-style placeholders. Each label box is as wide as its
  screenshot (the plan's `width`), so it doesn't wrap.
- **Deleting needs the person's explicit confirmation** (the Miro tools'
  rule). Replacing a screenshot is a new image plus deleting the old one, so
  collect the run's replacements and removals and ask once. Delete with
  `canvas_update_from_svg` and a stub per id:
  `<image data-type="image" data-miro-id="…" data-deleted="true" />` (or
  `rect`, `textArea`, `line` for the item's type).
- **Check the result**: read one or two regions with `canvas_read_as_svg`
  (images inside their cards, lines between the right cards) before you
  report. The browser may not be signed in to Miro; don't sign in.

## Drawing rules

`layout.mjs` implements these; change both together, and after any change to
`layout.mjs` run `node --test .claude/skills/ui-sitemap/layout.test.mjs` (a
manual test: CI does not run it).

- A tidy top-down tree: one row per level, top-aligned. Siblings sit side by
  side in sitemap order, their subtrees a gap apart, and each parent is
  centred over its children: the middle of the span from the first child's
  top box to the last one's. Lines between rows therefore run nearly
  straight down, and the lines of one parent never cross another's. "Level
  n" at the left of each row; a large title and a one-line subtitle on top.
- Placed screenshot width by level: 0 → 1440, 1 → 960, 2 → 720, 3 and
  deeper → 540; the height follows the image. Name (bold) / path (regular,
  grey) font sizes: 64/32, 44/22, 32/16, 24/12, in Noto Sans; a text box is
  1.45 times its font size high. Card padding: 48, 32, 24, 18.
- `page`: a card (faint blue `#f0f5fd`, rounded) with the name, the path and
  the screenshot.
- `tabs`: a group box (faint grey `#f7f7f7`, thin `#e7e7e7` border, the page
  name once at the top) with a card per `tab` inside, at the page's level
  size. Each tab is centred over its own subtree, so tabs with many children
  stand far apart and the box stretches across all of them. No lines
  between tabs; the parent connects to the group box; a tab's children
  connect from its tab card.
- `wizard`: a group box like `tabs`, with a card per `step` and straight
  arrows from each step to the next, because they are a sequence. Where a
  step has dialogs or states beside it, the arrow to the next step goes
  elbowed over the top of them.
- `dialog`: a card at its page's size, beside the page in the same row,
  joined by a straight dashed line labelled "Dialog".
- `state` (empty, error, managed elsewhere, …): a card one level smaller,
  faint amber `#fff8e6`, beside its page, joined by a dashed line labelled
  "State".
- Several dialogs and states of one page form a chain to its right, in
  sitemap order, each line joining a card to the one before it, so no line
  crosses a card.
- Lines between levels: elbowed, `#313131`, width 4, arrow at the child, from
  the bottom of the parent to the top of the child. Miro routes connectors
  itself; the plan's `points` show the intended route.

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
  belongs to, or under the `tabs` group when every tab opens it (from the
  page header); `layout.mjs` rejects anything else. A tab whose own
  sub-tabs share its default view (Connectors and Your connectors) is one
  card: its other sub-tabs are `page`s under it, so the same screen isn't
  drawn twice.
- `path`: the route template, with `:installation`-style placeholders. A
  dialog or state has its page's path; a default tab its page's bare path.
- `reach`: empty, or how to get there (see [Capture](#capture)); a long one
  points to `recipes/<id>.md`. Neutral examples only (see
  [Customer data](#customer-data)).
- `note`: free text — what never to press, when the page has the tab, a
  fixed viewport. When a page exists only for some data (an edit form for
  what was added in the portal), say what to capture where it doesn't, and
  add that screen as a `state`.

## sitemap.state.tsv

```
id	captured	commit	viewport	card	image	label	edge	skipped
```

One row per node on the board: the capture time (`2026-10-21T14:03:00Z`, the
PNG's modification time rounded up to the second), the short commit
captured, the viewport (`1440x2400x2`), the Miro ids of its card (or group
box), image, labels (name and path, comma-separated) and incoming line, and
why it has no screenshot yet (`skipped`, empty once it has one). Rows whose
`id` starts with `_` are the board's own items (`_title`, `_subtitle`,
`_level-0`, …), with the id in `label`, and the drawing itself
(`_layout`): the fingerprint of the drawing rules that drew the board in
`commit`, its origin (`x,y`) in `viewport`. Written only by
`layout.mjs --write-state`, after the items exist, in sitemap row order. A
node's `viewport` is what `layout.mjs` sizes it by when there is no new PNG
for it, so the board's layout can be recomputed on any machine.

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
- `nodes`: each node's kind, level, reach, note, capture state and
  `skipped` reason.
- `bounds`: the drawing's box; its top-left corner is `--origin`.
- `changes`, from the state's Miro ids: the item keys to `create` (no id
  yet), `update` (moved, resized, restyled or new text) and `replace` (a new
  screenshot: a new image item), and `delete`, every Miro id in the state
  that no item keeps — removed nodes, a cleared path's label, a level marker
  the tree no longer reaches, the old image of a replaced screenshot. Each
  item also carries its `action` (`create`, `update`, `replace`, `keep`, or
  `none` for a screenshot not taken yet).

"What moved" is measured against the board as the state says it was drawn:
`layout.mjs` lays out the sitemap from the commit that last wrote the state
(`git show`), keeping only the nodes with a card in the state, sized by the
state alone. `--board-sitemap file` gives that sitemap by hand. That
comparison uses the current drawing rules, so it can't see a change to the
rules themselves or a different origin: when the state's `_layout` names
other rules (a fingerprint of the code and constants that place items) or
another origin, or has no `_layout` row, every item already on the board is
updated, and `layout.mjs` says why.

The same input always gives the same plan. Options: `--screens dir`,
`--no-screens`, `--sitemap`, `--state`, `--board-sitemap`, `--origin x,y`
(the drawing's top-left corner: the title's, and the level markers' left
edge; by default the one the state records), `--svg file`, `--uploads file`, and `--write-state` with `--result`,
`--images`, `--skipped` and `--commit`; `--help` lists them.

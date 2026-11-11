---
name: ui-impact
description: Assess how much visible UI your own pull request changes — the pages it touches by route template, whether the change is shared, shell-wide or conditional, its kind and the steps to check it — score it, and write the "UI impact" section and its machine-readable block into the PR description, asking for a manual UI test before merge from score 6. Use before asking for review of any pull request in this repository, and again after pushing commits that change the UI.
---

# UI impact of a pull request

Automated tests cover the portal's UI poorly, so UI changes are tested by
hand, and pull requests are ranked by how much visible UI they change. The
author of a pull request assesses its own: what a person sees differently,
on which pages, and how to check it. The assessment goes into the PR
description as a `### UI impact` section that ends in a one-line
machine-readable block; the triage that ranks pull requests reads the block
instead of making its own. From score 6 the pull request waits for a manual
UI test before it merges.

| File | What it is |
|---|---|
| `score.mjs` | Turns a footprint (below) into the score, the reach and the PR section with its block. The scoring's one implementation, the same arithmetic as the triage. No dependencies. |
| `score.test.mjs` | Its tests: `node --test .claude/skills/ui-impact/score.test.mjs` |
| `reach.tsv` | Route template → reach level (`high`, `medium`, `low`), read from portal usage outside this repo. Levels only: never add usage numbers, the repo is public. A route it doesn't list counts as low. Don't change levels by guess. |

Commands run from the repo root; `S=.claude/skills/ui-impact`.

## When

- **Every pull request, before you ask for review**, including the ones that
  change nothing visible: those get the one-line section and a block with
  score 0, so the triage knows they were assessed. A PR that touches no
  frontend code (backend only, docs, CI, tests, skills) takes a minute.
- **Again after every push.** The block names the commit it was made at
  (`sha`); see "Keeping it current".

## 1. Read your own diff

```bash
git fetch -q origin main
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- packages/app plugins
```

Frontend code is `packages/app/src` and the `src/` of the frontend plugins
and libraries (the repository map in `AGENTS.md` names them). Tests,
stories, docs, changesets, CI and the backend show nothing by themselves. A
backend change still counts when it changes what a page shows: a field a
page renders, an error it now gets, data it now lists.

## 2. Map the footprint

Work out, from the code (not from screenshots):

1. **pages**: every page where a person sees a difference, by route
   template (`/sessions/:installation/:sessionId`, not a concrete URL), with
   a short note of what differs there. Trace each changed component up its
   imports to the route or page that renders it (`git grep -n
   '<Component\b' -- plugins packages`). Take the templates from the
   [`ui-sitemap`](../ui-sitemap/SKILL.md) skill's `sitemap.tsv` (its `path`
   column), the [`urls`](../urls/SKILL.md) skill's tree or the router, and
   check them against `reach.tsv`; a page in neither, give its template
   anyway and add "not in sitemap" to the note. A change that shows on every
   shell page (the layout, a banner, the side rail) takes the path `/*` with
   a note naming where it shows.
2. **shared**: true when the change sits in a component or style many pages
   use: `plugins/ui-react`, the shell layout or side rail, markdown
   rendering, link components, date or number formatters, a shared table or
   chart helper. **shellWide**: true when it shows on every shell page (the
   layout, a banner, the side rail).
3. **conditional**: true when a person only sees it in a specific
   situation: an error or failure, a configuration most installations don't
   have, a rare state, a deep link. false when it shows in normal use of the
   page. **when**: a few words saying when it shows ("always", "only on
   failed turns", "only with read-only skill sources", "with the side rail
   expanded").
4. **kind**, the dominant one: `new-flow` (a new page, flow or feature),
   `behaviour` (what happens on click, submit or load changes), `layout`
   (visual or structure), `wording` (copy only), `none` (nothing visible:
   tests, backend only, refactor, docs).
5. **check**: 2 to 4 steps to verify it live: the path, the clicks, what to
   look for. Steps that work on agentlab are best. Never a step that
   creates, deletes or submits real data unless it's the only way, and then
   say so in the step.
6. **headline** (3 to 6 words, a short name) and **summary** (one
   sentence: what a person notices).

Be concrete and short. Write the footprint to a file outside the repo (your
scratch directory), one JSON object:

```json
{
  "headline": "Larger side-rail text",
  "summary": "The side rail's recent sessions are set in 12 px instead of 10 px on every shell page.",
  "pages": [
    {
      "path": "/*",
      "note": "side rail, Recent sessions: heading, links and subtitles at 12 px (rail expanded)"
    }
  ],
  "shared": true,
  "shellWide": true,
  "conditional": false,
  "when": "always, with the side rail expanded",
  "kind": "layout",
  "check": [
    "Open / with the side rail expanded.",
    "Under Recent sessions, the heading, the All sessions link and the session subtitles read at body size, not smaller."
  ]
}
```

No visible change: `"kind": "none"`, `"pages": []`, `"check": []`,
`"when": "never"`, the three booleans false, and a headline and summary that
say what the PR does instead ("Backend log levels only").

## 3. Score it and write the section

```bash
F=<scratch>/ui-impact.json
node $S/score.mjs $F --print score      # "8<TAB>every page"
node $S/score.mjs $F                    # the section, to read it first
```

The script refuses an incomplete footprint and says what is missing. `sha`
defaults to `git rev-parse HEAD`: run it after your last commit is pushed.

Then put the section into the PR description. `--body` prints a description
with its `### UI impact` section replaced (the template's placeholder or an
earlier assessment), or inserted before `### Preview` when it has none:

```bash
gh pr view <N> --json body -q .body > <scratch>/body.md
node $S/score.mjs $F --body <scratch>/body.md > <scratch>/body.new.md
gh pr edit <N> --body-file <scratch>/body.new.md
```

Opening the PR, run `--body` on the body file you pass to `gh pr create`;
the section goes where `.github/pull_request_template.md` puts it, after
"Effect on end users".

What it writes, all generated: don't hand-edit the section, change the
footprint and run the script again.

- Score 0: `No visible UI change.` and the block.
- Score 1 to 5: the score, reach, kind and when it shows; the headline and
  summary; the pages; the check steps under "How to check".
- Score 6 or more: the same, starting with `Manual UI test needed before
  merge.`, the check steps as the "Test plan".
- Last, one line: `<!-- ui-impact {"v":1,"sha":"<head commit>","score":N,"reach":"...","when":"...","kind":"...","shared":bool,"shellWide":bool,"conditional":bool,"pages":[{"path":"...","note":"..."}],"check":["..."],"headline":"...","summary":"..."} -->`.
  GitHub doesn't render it; the triage reads it.

## 4. Labels

- **Score 6 or more**: add `ui-test-needed`
  (`gh pr edit <N> --add-label ui-test-needed`). Don't merge the PR, and
  don't ask for it to be merged, until `ui-tested` has replaced it.
- `ui-tested` is set by whoever did the manual test, and they remove
  `ui-test-needed`. Don't set it yourself, and keep the request neutral:
  don't name or ask a person to test.
- A later push brings the score under 6: remove `ui-test-needed`.
- A push after `ui-tested` that changes the UI again: the test no longer
  covers the head. Remove `ui-tested`, add `ui-test-needed` back when the
  new score is 6 or more, and say in the PR what changed since the test.

The manual test doesn't replace your own checks: a change to a page is still
verified in a browser against agentlab and ships with its spec (`AGENTS.md`,
"Test").

## Keeping it current

The assessment holds for the commit in `sha`. **A block whose `sha` is not
the PR's head commit is stale, and a stale assessment must be redone**:
whoever reads it, the triage included, doesn't trust it. So after every push:

- The push changed frontend code, or anything a page shows: redo step 2 on
  the whole diff (`origin/main...HEAD`, not only the new commits), run the
  script again, update the section and the labels.
- It didn't (a test, a backend fix, CI): keep the assessment and move `sha`
  to the new head. `--reuse` takes the footprint from the description's
  block, so nothing needs to be kept between sessions:

  ```bash
  gh pr view <N> --json body -q .body > <scratch>/body.md
  node $S/score.mjs --reuse <scratch>/body.md --body <scratch>/body.md > <scratch>/body.new.md
  gh pr edit <N> --body-file <scratch>/body.new.md
  ```

A merge of `main` into your branch counts as a push: check whether the diff
against `main` still says the same.

## Scoring

The triage's rules, in `score.mjs`; change them there and in the triage
together, or the two give different scores.

- **Reach level**: 3 for every page (`shellWide`) or a `high` page, 2 for
  `medium`, 1 for `low` or a page `reach.tsv` doesn't list. The highest
  page counts. A `conditional` change is always 1.
- **Kind weight**: new-flow 4, behaviour 3, layout 2, wording 1, none 0.
- **Score** = level × weight, +2 when `shared`; kind `none` scores 0.
- **Reach label**: `every page`, `high`, `medium` or `low`, with `, shared`
  for a shared change (not after `every page`); `–` for kind `none`.
- A footprint path matches a `reach.tsv` template exactly, or either one
  matches the other with each `:param` standing for one segment, so a
  concrete path and a slightly different template both find their row.

Examples: the side rail on every page, layout, shared: 3 × 2 + 2 = 8, a
manual test. A new tab on a `medium` page: 2 × 4 = 8. A wording fix on a
`high` page: 3 × 1 = 3. A new error state in a shared component (behaviour,
conditional): 1 × 3 + 2 = 5.

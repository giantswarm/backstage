---
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Plans: the proposed plans read as a table, one column per fact. The open pull requests of a plan repository were a list whose facts were run together into one line (`#412 · marians · 7 files changed · updated Sep 18, 2026`); they are now a bui `Table` with PR, Author, Status, Last updated, Title and Epic as columns, sortable, newest first. Only a draft is marked — every row is an open pull request, so a badge on the others would say nothing. The changed-file count is gone, and with it the `GET /pulls/:n/files` request the list made per row.

The author is the person, not their GitHub login: their photo and display name, linking to their catalog User entity. `UserEntityLink`, a new `ui-react` export, composes that from `EntityRefLink`, which resolves the name and degrades to the bare login for an author the catalog does not know (an outside contributor, a bot). The photo comes from a single batched catalog read for the whole table, because `DefaultEntityPresentationApi` fetches a fixed field list that `spec.profile.picture` is not part of and that cannot be extended. Entity refs are lower-cased, since the catalog indexes them that way — a mixed-case login like `QuentinBisson` otherwise matches nothing and renders with neither name nor photo.

The epic cell is a plain link to the issue number, since the column heading already says Epic; the board status it used to spell out moves into the link's tooltip. `stopRowPress` moves from `agent-platform` to `ui-react` now that other plugins need it, and the epic link stops its own press from reaching the row behind it, so clicking it no longer opens the epic _and_ the plan.

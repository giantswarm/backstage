---
'@giantswarm/backstage-plugin-muster': patch
---

Long muster lists stay usable at hundreds of entries and stay plain at a few:

- Customize → Workflows renders 20 workflows (sorted by name) at a time with
  _Show more_, and reads the latest run only for the workflows on screen —
  it used to send one request per workflow on open and on every search
  keystroke.
- A connector's Tools tab renders 20 tools at a time, starting over when the
  search or the Reads/Changes filter changes; with eight tools or fewer it
  shows neither the search nor the filter.
- A workflow's recent runs keep the newest 5 as the first page and offer
  _Show older runs_, reading 20 more at a time with muster's `offset`; before,
  nothing past the newest 5 was reachable.
- An expanded run's step trace renders 20 steps at a time (a loop leaves one
  record per iteration); a failed step past the first page stays pinned in
  view below them.
- The tool runner's Table view renders 50 rows at a time, and a result longer
  than 50 rows gets a filter over every cell's text.

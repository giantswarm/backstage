---
'@giantswarm/backstage-plugin-muster': minor
---

Workflow page: "How it runs" is now a flow canvas drawn only from the
workflow's definition — the steps in order on one spine, forEach and parallel
steps as groups, a condition as an "Only if …" gate on the edge into the step
it may skip (never a yes/no branch), and the cleanup steps as their own dashed
lane; no trigger, schedule or version, since muster has none. The canvas sits
in a capped, scrollable viewport so a long workflow does not bury the page.
With a muster session, the latest run colours each step (succeeded, failed,
skipped, not run, with a loop's iteration count and durations where muster
recorded them) and each step says whether its tool only reads or changes
things. Clicking a step opens its details: the plain description first, then
that step's own "Show technical information" fold-out (exact tool, templated
arguments, condition spec). The duplicate step list and the page-wide
technical toggle are gone — each run's execution record and the raw
definition have their own fold-outs. Recent runs lists the latest five; the
succeeded/failed totals (muster's own per-status counts) moved into the
details panel.

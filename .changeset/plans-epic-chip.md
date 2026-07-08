---
'@giantswarm/backstage-plugin-plans': patch
---

Surface a plan's epic as a chip above the rendered PRD. The chip resolves the
conventional `**Epic:** [...](...)` header link to its roadmap board item via
the roadmap backend and links to the in-portal item view, degrading to a plain
GitHub link when the roadmap plugin is not installed or the issue is not on
the board.

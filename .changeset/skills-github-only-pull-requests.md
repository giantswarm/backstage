---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Skill pull requests are github.com only, and the UI now says so instead of
failing with a 400: "Add skill" lists only github.com repositories as targets
(noting why others are missing) and is replaced by a short note when none of
the configured repositories is on github.com. A skill from any other git
repository gets a read-only detail page
(`/agent-platform/skills/-/<host>/<repo path>[/-/<skill dir>]`) with its
description, instructions and users, no Edit or Evaluate, and a note naming the
reason; its edit address explains the same instead of offering a form.

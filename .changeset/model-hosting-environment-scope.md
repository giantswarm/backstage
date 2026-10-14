---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Model hosting (Running models, GPU pools, Model cache) has the Environment control in its header. It sets the same scope as Customize › Models, so a change on either page shows on the other, and the tab links keep the scope. Picking an environment that runs no serving layer keeps the tabs, and a pinned environment the portal does not know is named instead of an empty state. Where no environment in view could be read, Running models no longer shows "Models running: 0" or says that no model is running, and GPU capacity no longer says "No GPU nodes found" or "unavailable for some environments". The Environment control no longer leaves an empty slot in the Customize header on a single-installation portal.

---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Model hosting (Running models, GPU pools, Model cache) has the Environment control in its header, the same scope as Customize › Models, so changing it on either side shows on the other; a pinned environment the portal does not know is named above the view, and the tab links keep the scope. Where no environment in view could be read, Running models no longer says that no model is running, and GPU capacity no longer says "No GPU nodes found" or "unavailable for some environments".

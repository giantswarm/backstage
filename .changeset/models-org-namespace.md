---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Connect a model waits, saying why, until the Owner choices on its environment are known, so a model meant for an Organization can't be saved to the platform before the Organization is offered. When that environment's Organizations can't be read, the page says the model goes to the platform. An environment whose agent-manager cannot be reached no longer holds up editing a model on another environment, and an environment muster doesn't list still holds edits outside the platform's namespace.

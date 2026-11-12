---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Connect a model waits, saying why, until the Owner choices are known, so a model meant for an Organization can't be saved to the platform before the Organization is offered. An environment whose agent-manager cannot be reached no longer holds up editing a model on another environment.

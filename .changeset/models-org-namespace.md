---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Connect a model waits, saying why, until the Owner choices on its environment are known, so a model meant for an Organization can't be saved to the platform before the Organization is offered. Where you have not signed in to Agent Manager on that environment, it waits for your sign-in and offers it in place; once signed in, the Owner choices appear. When the Organizations can't be read for another reason, the page says the model goes to the platform. An environment whose agent-manager cannot be reached no longer holds up editing a model on another environment, and an environment muster doesn't list still holds edits outside the platform's namespace.

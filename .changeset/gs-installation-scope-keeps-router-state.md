---
'@giantswarm/backstage-plugin-gs': patch
---

The installation scope keeps the router state when it writes `?installation=` into the URL. Dropping it lost the first message of an Agent Platform session started from an agent's page: the session page opened without it, and the agent never got the prompt.

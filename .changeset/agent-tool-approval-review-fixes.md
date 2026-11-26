---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Tool approval per agent, review fixes: a save never drops an agent's approval settings when agent-manager's schema cannot be read, and saves nothing over a change someone else made meanwhile (`expectedGeneration`, a re-read before the write, the conflict shown with a reload). Grants carry the tools they cover to muster. A create whose exceptions are refused offers the created agent; partial saves say what landed. _Allowed for_ reads every readable namespace in one call and says when some could not be read. Pills show what muster reports where the platform asks, describe why _Allow_ is disabled, and name their reset buttons; summaries say when they are partial or not enforced.

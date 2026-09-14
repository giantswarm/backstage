---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Saving an agent no longer reports success before the change has been compiled.

After Save, the detail page showed a green "Ready … (saved as you)" almost
immediately — for the revision that was there *before* the write. agent-manager
writes the agent's HelmRelease and returns; helm-controller re-renders the
AgentTemplate seconds later, so the first status read after saving an agent that
was already ready answers `ready` about the old revision. Worse, the page then
stopped polling, so if the new revision went on to fail it kept claiming Ready.

The progress now waits for the revision the write produced: the template
generation is read immediately before the write and the verdict only counts once
it has moved past it and the controller has caught up. The wait is bounded at a
minute, after which the current verdict is shown rather than a spinner that
never resolves — which covers a release that cannot be reconciled at all.

Creating an agent is unaffected: there is no earlier generation to compare
against, so the verdict stands on its own as before.

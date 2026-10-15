---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

The wizard's runtime picker, the review page and the agent status card no
longer show a Harness's per-turn limits: kagent's Harness carries no budget or
turn cap any more. `ClaudeHarnessLimits` and `Harness.getLimits()` are gone.
A turn's reported usage and cost still show in the session view.

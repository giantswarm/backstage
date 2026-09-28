---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

The session page shows the cost the agent's runtime reported beside the estimated cost. The claude Harness reports `costUsd` in each turn's `kagent.dev/a2a/usage`; `TokenUsage` carries it as `costUsd`, summed like the tokens and absent when no turn reported one. A session whose runtime reports no cost shows no reported figure.

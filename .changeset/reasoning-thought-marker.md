---
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Show the model's reasoning as "Reasoning" again in a session's timeline when
kagent marks it with `kagent.dev/a2a/thought`, both in the stored history and
while the reply streams. Before, a streamed artifact that carried reasoning and
an answer showed both run together as the answer.

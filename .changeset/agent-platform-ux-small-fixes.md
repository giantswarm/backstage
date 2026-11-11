---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Usage › Connectors draws p95 latency bars in neutral grey, and the Cost tab's per-model table draws average tokens per call in green, rather than red, which the usage pages keep for errors. The sessions side panel sets its heading, links and session subtitles in body-small (12 px) rather than 10 px. The create-agent wizard no longer marks Name "(Required)", since only optional fields are marked, and its model line leads with provider and model ("Runs on Anthropic · claude-sonnet-4-6"), with the model config's name behind the info button. Customize › Models adds the namespace to rows whose model configs share a name.

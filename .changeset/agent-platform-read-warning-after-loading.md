---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The "Could not read N environments" warning no longer shows above a list's
loading indicator. On Customize → Agents and Models, Home, Sessions and Model
hosting it appears once the list has something to show — its first rows, or its
empty or failed answer — even while other environments are still being read.
Model hosting no longer waits for its GPU node reads before showing the served
models, and its "Could not read the downloads" warning waits the same way. A
closed warning stays closed when the list reloads and fails the same way.

---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Adding a model is now **Connect a model** everywhere — the Models list's button, Customize → Models' create action, the flow's title and its primary button (Connect model). The flow leads with the plain fields: display name (required; the technical name is filled in from it), provider and model, and the API key, which is now simply optional — leaving it empty means the endpoint needs none (the separate "This endpoint requires no API key" switch is gone; the Secret still gets a placeholder value, as before). The technical name and "Skip TLS certificate verification" moved under **More options**, as in the agent wizard. Provider and Model line up side by side however long their descriptions run.

A model's **Edit** no longer swaps a form into its page: it opens the same flow prefilled at `/agent-platform/models/edit/<installation>/<namespace>/<name>`, with **Save changes** as the primary button (enabled once something changed) and the environment and technical name fixed. Models asserted by Helm, Flux or another tool, on a provider the form does not speak, or without permission to update them still offer no Edit, and their edit address says why. On an edit that changes the provider, an empty key field now writes a placeholder key for the new provider instead of blocking the save.

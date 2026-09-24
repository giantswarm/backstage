---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Name the agent on its detail page: the browser tab reads
"<agent> · Agents · Agent Platform" (display name, falling back to the
technical name), and the agent's name is the page's `h2` heading. The
Configuration card is a description list instead of `h6` headings, and the
Status card's conditions are `h4` headings under the card's `h3`.

A ModelConfig without the `ui.giantswarm.io/display-name` annotation is no
longer shown by its resource name as if that were the model: the detail page
leads with the model and provider, and the Agents table's Model column shows
the model (`spec.model`).

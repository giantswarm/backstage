---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': patch
---

Explain unpriced models against agentgateway's built-in price catalogue. The gateway prices from the catalogue its release ships, with the platform's `llmRouting.modelCatalog` as an overlay on top (giantswarm/giantswarm#37975). The "Models with no usable price" card and the lookup-status metric description now say a model is `Missing` when neither prices it, and that the fix is a gateway release that prices it or an overlay entry.

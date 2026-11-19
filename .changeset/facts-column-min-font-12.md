---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

The facts column beside a record page sets no text below 12px: `FactsColumn` sets bui's 10px size (`body-x-small`, small badges and tags) to 12px inside the column, and the agent page's facts set their secondary lines (the model's provider, the Harness's name and image, the creator's email, a runtime note) in `body-small`.

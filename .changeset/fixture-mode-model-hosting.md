---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs-common': patch
'@giantswarm/backstage-plugin-muster': patch
---

Fixture mode serves model hosting, outside production builds only: model-manager's and cluster-manager's tools and the fixture `ModelManagerApi` answer from the base data set, so Model hosting's Running models, GPU pools and Model cache, and its Serve, Import, Pull, Add backend and Add GPU node pool flows show data without a cluster. The data set of `@giantswarm/backstage-plugin-gs-common/fixtures` gains model-manager backends, GPU clusters with pools and cache claims, and hosted models. Writes are kept in memory until the page reloads; a serve moves through its phases, a pull and a new pool finish after a few seconds. A fixture MCP server can declare the input schemas `describeTool` answers.

Model hosting no longer logs React's "changed size between renders" warning once the environments that can download models are known.

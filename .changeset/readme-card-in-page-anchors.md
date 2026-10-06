---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-gs': patch
---

Collapsible markdown cards (README, SOUL): a `#heading` link in a document loaded from GitHub now opens the document on github.com at that heading. The card builds heading ids differently from GitHub and routes the hash through the router, so the in-page jump did not land on the heading. Markdown rendered without a source URL is unchanged.

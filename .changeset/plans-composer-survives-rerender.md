---
'@giantswarm/backstage-plugin-plans': patch
---

A comment on a rendered plan document no longer comes back as an empty, still
open composer when the request fails. The rendered view recreated its block
components on every re-render, so the review page's own re-render during the
request remounted the composer: the draft was wiped, the error landed on the
unmounted form, and nothing told the reader the comment was rejected. The block
components are now created once and the error (for example GitHub's 403 when
the Dev Portal's GitHub App lacks pull-request write permission) shows under the
draft, which stays put.

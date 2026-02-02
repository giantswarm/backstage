---
'@giantswarm/backstage-plugin-gs': patch
---

Fix GitOpsCard source URL generation for new Flux CD revision formats. The revision field now correctly parses formats like `main@sha1:abc123...` and `sha256:abc123...` to extract the commit SHA for URL construction.

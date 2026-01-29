---
'@giantswarm/backstage-plugin-gs': patch
---

Improve findResourceByRef to support multi-version API matching

- Match resources by API group instead of exact apiVersion to handle version differences
- Support both ObjectReference (apiVersion) and TypedLocalObjectReference (apiGroup) formats
- Add comprehensive test coverage

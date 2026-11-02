---
'@giantswarm/backstage-plugin-gs': patch
---

`useMimirQuery` and `useMimirRangeQuery` report `isPlaceholderData`: whether
the answer they return is the previous query key's, held by
`keepPreviousAnswer` while the new key's first fetch runs. A caller whose key
moves both with the clock and with its scope can then hold the answer across
the clock and still report a scope change as loading.

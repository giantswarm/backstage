---
'@giantswarm/backstage-plugin-gs': patch
---

Submitting a template after the portal's sign-in expired and declining the
sign-in it asks for shows "Your sign-in expired" on the review step, with the
entries kept, instead of "Couldn't start the template". The sign-in asked for
first is the portal's own, for the template read before the cluster tokens are
minted, and `scaffold` now reports it like a sign-in a cluster token needs.

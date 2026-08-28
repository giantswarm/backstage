---
'@giantswarm/backstage-plugin-muster': patch
---

Re-read the muster auth status when a sign-out request fails in transport, instead of leaving the row on a stale "Sign out": the logout may have landed server-side even though the answer was lost (e.g. a backend pod terminated by a rollout mid-request). Transport errors for sign-in/sign-out are now also prefixed with the action they belong to instead of a bare "Failed to fetch".

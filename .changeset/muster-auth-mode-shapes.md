---
'@giantswarm/backstage-plugin-muster': patch
---

A server registered with Platform SSO or token exchange (a forwarded token, no
`auth.type`) no longer shows as "No authentication configured" in its details.
Edit only opens the registration wizard for a server whose auth block is
exactly what its wizard answer writes, so saving can no longer drop settings of
another answer (such as required audiences on an OAuth sign-in), and an auth
type this portal does not know is sent to "Edit as JSON" instead of being read
as no authentication.

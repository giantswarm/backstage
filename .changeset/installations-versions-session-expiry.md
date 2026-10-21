---
'@giantswarm/backstage-plugin-gs': patch
---

The Installations page's management cluster versions never open the Login
Required dialog on a background refetch: without a user gesture the query asks
the main login optionally, and after the portal session expired the page shows
its installations as "Not signed in" instead of a sign-in popup.

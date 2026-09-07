---
'@giantswarm/backstage-plugin-gs': patch
---

The installation inventory reports `isProbing` while any installation's cluster-access probe is still `connecting`, even when that installation's inventory answer is already cached from an earlier visit. Such an installation is not listed by `installationsWith` yet (it is not `healthy`), so the Agent Platform tabs had nothing to query for it _for now_ and read that as nothing to load: pinned to an installation other than the home, a cold reload showed "No agents found." for the seconds until its `/version` probe answered. They now keep their loading state until it settles.

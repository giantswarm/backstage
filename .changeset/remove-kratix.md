---
'@giantswarm/backstage-plugin-gs': minor
---

Remove Kratix support. Kratix is an unused internal-developer-platform tool being removed org-wide (refs giantswarm/giantswarm#36422). This drops the Kratix status entity card, the Kratix resources entity content tab, the `entityKratixResourcesContent` route, the `isEntityKratixResource` entity helper, the `kratix` components directory (`ResourceRequestsTable`, `ResourceRequestStatus`), and the now-unused `useResourceRequests` / `useResourceRequestStatusDetails` hooks.

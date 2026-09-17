---
'@giantswarm/backstage-plugin-repositories-backend': patch
---

`POST /repositories/validate` hands the `reason` on to `validate_repository`,
which takes the same arguments as `create_repository` since
giantswarm-repo-manager 0.9.3. Before, a Review with the Reason field filled
was refused by the backend (`validate_repository takes no argument 'reason'`).

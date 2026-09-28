---
'@giantswarm/backstage-plugin-platform-capabilities': minor
'@giantswarm/backstage-plugin-platform-capabilities-backend': minor
---

Enable and Apply changes ask **Why this change** on the review step: the pull requests open only once it is filled, and the reason goes to the platform manager with the commit (`reason`), which requires it and shows it to the team in the approval request above what changes. The backend passes `reason` through to `enable_capability` and `reconcile_capability`.

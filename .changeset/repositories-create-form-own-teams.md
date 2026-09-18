---
'@giantswarm/backstage-plugin-repositories': patch
---

Create repository opens on the person's team where the identity carries no
team groups -- the Dev Portal behind the GitHub App: the caller's teams are now
read off the manager's `mine` listing (membership as the manager reads it on
GitHub as the person), the identity's groups staying a second source. Before,
the Team choice listed every team of the inventory but preselected none and
marked none as _your team_ on the Dev Portal.

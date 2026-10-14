---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The link on a success message after a pull request is opened reads "Review pull
request ↗" instead of "Open the pull request ↗", matching Add skill: the pull
request is already open. This covers creating, editing and deleting an agent,
Update skills, adding a model backend, adding and removing a GPU node pool, and
creating and deleting a cluster.

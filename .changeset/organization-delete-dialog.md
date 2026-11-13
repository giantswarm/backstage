---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

A person who manages an organization deletes it from its page. The dialog lists what agent-manager says the delete erases, what is kept and the running sessions it stops. It erases only once the person types `<parent>/<name>`. For an organization applied from git, Delete opens the pull request that removes it, and Erase now on Pending erase erases it after that pull request merged. Missing from git offers neither. The organization page also reads `get_organization` in the shape agent-manager answers it, so its status notices show for organizations-admins. New events `AgentPlatform.organizationDeleteRequested` and `AgentPlatform.organizationErased`.

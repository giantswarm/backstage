---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A person who manages an organization whose namespace the operator has not created yet can delete it from its page: Delete organization (with the typed `<parent>/<name>`, or the pull request for one applied from git) and Pending erase's Erase now are offered there too, and the delete dialog says there is nothing inside a namespace to erase and no session stops. That page also shows the organization's state (Pending erase, Missing from git, Erasing), and says the organization is erased when it is gone right after its delete. A member who does not manage it still gets no Delete.
